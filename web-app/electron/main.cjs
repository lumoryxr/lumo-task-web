const { app, BrowserWindow, shell, ipcMain, utilityProcess, screen, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const crypto = require("crypto");
const net = require("net");
const os = require("os");

// ── File logger ───────────────────────────────────────────────────────────────

let logStream = null;

function initLogger() {
  const logsDir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(logsDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const logFile = path.join(logsDir, `lumo-${date}.log`);
  logStream = fs.createWriteStream(logFile, { flags: "a", encoding: "utf8" });

  // Prune logs older than 7 days
  try {
    const files = fs.readdirSync(logsDir)
      .filter((f) => f.startsWith("lumo-") && f.endsWith(".log"))
      .sort();
    if (files.length > 7) {
      files.slice(0, files.length - 7).forEach((f) => {
        try { fs.unlinkSync(path.join(logsDir, f)); } catch {}
      });
    }
  } catch {}

  log(`[main] Log file: ${logFile}`);
  return logFile;
}

function log(line) {
  const ts = new Date().toISOString();
  const entry = `${ts} ${line}\n`;
  process.stdout.write(entry);
  if (logStream) logStream.write(entry);
}

// Catch uncaught main-process errors
process.on("uncaughtException", (err) => {
  log(`[main] uncaughtException: ${err?.stack ?? err}`);
});
process.on("unhandledRejection", (reason) => {
  log(`[main] unhandledRejection: ${reason instanceof Error ? reason.stack : reason}`);
});

// ── JWT secret ────────────────────────────────────────────────────────────────

function getOrCreateJwtSecret() {
  const secretPath = path.join(app.getPath("userData"), "jwt.secret");
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, "utf8").trim();
  }
  const secret = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

// ── Encryption key ──────────────────────────────────────────────────────────
//
// The bundled backend refuses to start without LUMO_ENCRYPTION_KEY (it encrypts
// stored secrets — AI keys, sync tokens — with AES-256-GCM). The desktop app is
// the only thing that launches the backend, so it must provision the key.
//
// MUST be persisted (not regenerated each launch): the key decrypts data written
// on previous runs; rotating it would make stored secrets unreadable. We mirror
// the JWT pattern — a per-install random key kept in userData with 0600 perms.
// 32 bytes hex = 64 chars, comfortably above the backend's 32-byte minimum.
function getOrCreateEncryptionKey() {
  const keyPath = path.join(app.getPath("userData"), "encryption.key");
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, "utf8").trim();
  }
  const key = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  return key;
}

// ── Free port finder ──────────────────────────────────────────────────────────

function findFreePort(preferred) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => {
      const fallback = net.createServer();
      fallback.unref();
      fallback.listen(0, "127.0.0.1", () => {
        const { port } = fallback.address();
        fallback.close(() => resolve(port));
      });
    });
    server.listen(preferred, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

// ── Wait for TCP port ─────────────────────────────────────────────────────────

function waitForPort(port, timeout) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    function attempt() {
      const sock = net.connect({ port, host: "127.0.0.1" });
      sock.on("connect", () => { sock.destroy(); resolve(); });
      sock.on("error", () => {
        if (Date.now() > deadline) return reject(new Error("Backend did not start in time"));
        setTimeout(attempt, 200);
      });
    }
    attempt();
  });
}

// ── Database path (supports user-customisable location) ───────────────────────

/**
 * Returns the SQLite database file path.
 *
 * Priority:
 *   1. User's saved preference  → userData/storage.json { dbDir: "/path/..." }
 *   2. Default                  → userData/lumo.db
 */
function getDbPath() {
  const prefPath = path.join(app.getPath("userData"), "storage.json");
  if (fs.existsSync(prefPath)) {
    try {
      const prefs = JSON.parse(fs.readFileSync(prefPath, "utf8"));
      if (prefs.dbDir && typeof prefs.dbDir === "string") {
        return path.join(prefs.dbDir, "lumo.db");
      }
    } catch {
      // Malformed prefs — fall through to default
    }
  }
  return path.join(app.getPath("userData"), "lumo.db");
}

function saveDbDirPref(dbDir) {
  const prefPath = path.join(app.getPath("userData"), "storage.json");
  fs.writeFileSync(prefPath, JSON.stringify({ dbDir }), { encoding: "utf8", mode: 0o600 });
}

// ── Cloud sync config ─────────────────────────────────────────────────────────

function getSyncConfig() {
  const syncPath = path.join(app.getPath("userData"), "sync.json");
  try {
    return JSON.parse(fs.readFileSync(syncPath, "utf8"));
  } catch {
    return { enabled: false, url: "", token: "" };
  }
}

function saveSyncConfig(cfg) {
  const syncPath = path.join(app.getPath("userData"), "sync.json");
  fs.writeFileSync(syncPath, JSON.stringify(cfg), { encoding: "utf8", mode: 0o600 });
}

// ── Backend process ───────────────────────────────────────────────────────────

let backendProcess = null;
let apiPort = 47291;

async function startBackend() {
  apiPort = await findFreePort(47291);
  const dbPath = getDbPath();
  const jwtSecret = getOrCreateJwtSecret();
  const encryptionKey = getOrCreateEncryptionKey();

  const syncCfg = getSyncConfig();

  // On Windows, backslashes in file paths break libsql's "file:" URL scheme.
  // Normalise to forward slashes for cross-platform SQLite URLs.
  const dbPathNormalised = dbPath.replace(/\\/g, "/");

  log(`[main] Starting backend on port ${apiPort}, db=${dbPathNormalised}`);
  const env = {
    ...process.env,
    LUMO_PORT: String(apiPort),
    LUMO_DB_PATH: dbPathNormalised,
    LUMO_JWT_SECRET: jwtSecret,
    LUMO_ENCRYPTION_KEY: encryptionKey,
    // In packaged builds, @libsql/* native modules live in extraResources.
    // NODE_PATH lets the forked bundle resolve them at runtime.
    ...(app.isPackaged
      ? { NODE_PATH: path.join(process.resourcesPath, "backend", "node_modules") }
      : {}),
    ...(syncCfg.enabled && syncCfg.url && syncCfg.token
      ? { TURSO_SYNC_URL: syncCfg.url, TURSO_SYNC_TOKEN: syncCfg.token }
      : {}),
  };

  function pipeOutput(proc) {
    const onData = (prefix) => (chunk) => {
      String(chunk).split(/\r?\n/).filter(Boolean).forEach((line) => log(`${prefix} ${line}`));
    };
    proc.stdout?.on("data", onData("[backend:out]"));
    proc.stderr?.on("data", onData("[backend:err]"));
    proc.on("exit", (code) => {
      log(`[backend] process exited with code ${code}`);
    });
  }

  if (app.isPackaged) {
    // ── Packaged: use Electron's built-in Node.js via utilityProcess.fork() ───
    const backendEntry = path.join(process.resourcesPath, "backend", "bundle.cjs");
    log(`[main] Backend entry (packaged): ${backendEntry}`);
    log(`[main] Entry exists: ${fs.existsSync(backendEntry)}`);

    backendProcess = utilityProcess.fork(backendEntry, [], { env, stdio: "pipe" });
    pipeOutput(backendProcess);
  } else {
    // ── Dev: use tsx with system Node.js ──────────────────────────────────────
    const distEntry = path.join(__dirname, "../../backend/dist/index.js");
    const tsxBin = path.join(__dirname, "../../backend/node_modules/.bin/tsx");
    const tsSrc = path.join(__dirname, "../../backend/src/index.ts");

    let cmd, args;
    // LUMO_USE_DIST=1 forces the pre-built bundle (useful for Playwright tests on Windows)
    const forceUseDist = process.env.LUMO_USE_DIST === "1";
    const tsxCmd = path.join(__dirname, "../../backend/node_modules/.bin/tsx.cmd");
    const tsxExe = fs.existsSync(tsxCmd) ? tsxCmd : (fs.existsSync(tsxBin) ? tsxBin : "tsx");

    if (fs.existsSync(distEntry) && (forceUseDist || !process.execPath.toLowerCase().includes("electron"))) {
      cmd = process.execPath;
      args = [distEntry];
    } else if (fs.existsSync(distEntry) && process.execPath.toLowerCase().includes("electron")) {
      cmd = tsxExe;
      args = [tsSrc];
    } else {
      cmd = tsxExe;
      args = [tsSrc];
    }

    log(`[main] Backend entry (dev): ${cmd} ${args.join(" ")}`);
    // .cmd files on Windows require shell:true to execute
    const needsShell = process.platform === "win32" && cmd.endsWith(".cmd");
    backendProcess = spawn(cmd, args, { env, stdio: "pipe", shell: needsShell });
    pipeOutput(backendProcess);
  }

  try {
    // Allow more time on Windows where process startup can be slower.
    const startupTimeout = process.platform === "win32" ? 30000 : 15000;
    await waitForPort(apiPort, startupTimeout);
    log(`[main] Backend ready on port ${apiPort}`);
  } catch (err) {
    log(`[main] ERROR: Backend did not become ready — ${err?.message ?? err}`);
    throw err;
  }
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Lumo Task",
    backgroundColor: "#080b0a",
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.loadFile(path.join(__dirname, "../dist/index.html"));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  ipcMain.on("win:minimize", () => win.minimize());
  ipcMain.on("win:maximize", () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on("win:close", () => win.close());

  ipcMain.handle("get-api-port", () => apiPort);

  // ── Storage / database path IPC ───────────────────────────────────────────

  /** Returns the absolute path to lumo.db currently in use. */
  ipcMain.handle("db:getPath", () => getDbPath());

  /**
   * Opens a native folder-picker dialog.
   * Returns the selected folder path, or null if the user cancelled.
   */
  ipcMain.handle("db:chooseFolder", async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
      title: "Choose Lumo Database Location",
      buttonLabel: "Select Folder",
    });
    return result.canceled ? null : result.filePaths[0];
  });

  /**
   * Copies lumo.db to newDir, saves the path preference, then relaunches the app.
   * The copy is atomic from the user's perspective because the app restarts.
   */
  ipcMain.handle("db:moveTo", async (_event, newDir) => {
    if (!newDir || typeof newDir !== "string") return { ok: false, error: "Invalid path" };
    // Reject network paths (\\server\share, //server/share) and anything
    // that doesn't resolve to the user's home directory or userData.
    const resolved = path.resolve(newDir);
    const allowedRoots = [os.homedir(), app.getPath("userData"), app.getPath("documents")];
    const isAllowed = allowedRoots.some((r) => resolved.startsWith(r));
    if (!isAllowed) return { ok: false, error: "Path must be within your home directory" };
    const currentDbPath = getDbPath();
    const newDbPath = path.join(newDir, "lumo.db");

    try {
      // Ensure destination directory exists
      fs.mkdirSync(newDir, { recursive: true });

      // Copy current DB to new location (keeps original as safety backup)
      fs.copyFileSync(currentDbPath, newDbPath);

      // Persist the new preference
      saveDbDirPref(newDir);

      // Relaunch so the backend starts with the new LUMO_DB_PATH
      app.relaunch();
      app.exit(0);
      return { ok: true };
    } catch (err) {
      console.error("[db:moveTo] failed:", err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  /** Reveals lumo.db in Finder / Explorer. */
  ipcMain.on("db:showInFolder", () => {
    shell.showItemInFolder(getDbPath());
  });

  // ── Cloud sync IPC ────────────────────────────────────────────────────────

  /** Returns the current sync config (without the token value for security). */
  ipcMain.handle("sync:getConfig", () => {
    const cfg = getSyncConfig();
    return { enabled: cfg.enabled ?? false, url: cfg.url ?? "", hasToken: !!(cfg.token) };
  });

  /**
   * Saves sync config and relaunches the app so the backend restarts with
   * the new TURSO_SYNC_URL / TURSO_SYNC_TOKEN env vars.
   */
  ipcMain.handle("sync:setConfig", (_event, cfg) => {
    if (typeof cfg !== "object" || cfg === null) return { ok: false, error: "Invalid config" };
    saveSyncConfig({
      enabled: !!cfg.enabled,
      url: typeof cfg.url === "string" ? cfg.url.trim().slice(0, 512) : "",
      token: typeof cfg.token === "string" ? cfg.token.trim().slice(0, 512) : "",
    });
    app.relaunch();
    app.exit(0);
    return { ok: true };
  });

  // ── Pet focus compact mode ────────────────────────────────────────────────
  let savedBounds = null;
  let wasMaximized = false;
  ipcMain.on("win:enter-focus", () => {
    wasMaximized = win.isMaximized();
    // Save bounds before unmaximize to avoid racing getBounds() against the
    // async unmaximize animation on Windows.
    savedBounds = win.getBounds();
    if (wasMaximized) win.unmaximize();
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    win.setMinimumSize(1, 1);
    win.setAlwaysOnTop(true, "floating");
    // 240×280 physical pixels keeps the widget correctly sized across DPI scales:
    // 125% → 192×224 CSS px, 150% → 160×187 CSS px, 200% → 120×140 CSS px.
    win.setSize(240, 280, true);
    win.setPosition(width - 260, height - 300);
    // Pre-focus so the first click restores the window instead of just activating it.
    win.focus();
  });
  ipcMain.on("win:exit-focus", () => {
    win.setAlwaysOnTop(false);
    win.setMinimumSize(900, 600);
    if (wasMaximized) {
      // Skip setBounds — maximize() restores the correct pre-compact geometry.
      win.maximize();
      wasMaximized = false;
      savedBounds = null;
    } else if (savedBounds) {
      win.setBounds(savedBounds, true);
      savedBounds = null;
    } else {
      win.setSize(1280, 800, true);
      win.center();
    }
  });
}

app.whenReady().then(async () => {
  const logFile = initLogger();
  log(`[main] App ready — version ${app.getVersion()}, userData=${app.getPath("userData")}`);
  log(`[main] Log file: ${logFile}`);

  let backendReady = false;
  try {
    await startBackend();
    backendReady = true;
  } catch (err) {
    log(`[main] FATAL: Failed to start backend — ${err?.stack ?? err}`);
    const { response } = await dialog.showMessageBox({
      type: "error",
      title: "Lumo Task — Backend Error",
      message: "The backend service failed to start.",
      detail:
        `Port ${apiPort} did not become ready.\n\n` +
        `Log file: ${logFile}\n\n` +
        "Please check the log file for details, then restart the app. " +
        "If the problem persists, reinstall Lumo Task.",
      buttons: ["Quit", "Open Log Folder"],
      defaultId: 0,
    });
    if (response === 1) {
      shell.showItemInFolder(logFile);
    }
    app.quit();
    return;
  }

  if (backendReady) createWindow();
});

app.on("window-all-closed", () => {
  if (backendProcess) {
    try { backendProcess.kill(); } catch {}
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
