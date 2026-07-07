/**
 * Lumo Task — local/LAN web package launcher.
 *
 * Run by the bundled Node runtime (`node.exe launcher.mjs`). It makes the
 * package self-contained and zero-config:
 *   1. Generates and PERSISTS the two required backend secrets on first run
 *      (per-install, like the desktop app), so the user never configures a
 *      secret — subsequent runs reuse them.
 *   2. Points the backend at a local SQLite file + the bundled `web/` SPA and
 *      binds the chosen host/port, then boots the server (`bundle.cjs`), which
 *      serves the app AND the API on one origin.
 *
 * Everything lives under the package directory (portable — copy the folder and
 * it keeps its data): `data/secrets.json`, `data/lumo.db`, `web/`, `bundle.cjs`.
 *
 * Overridable via environment before launch:
 *   LUMO_PORT (default 47291) · LUMO_HOST (default 0.0.0.0 = LAN reachable;
 *   set 127.0.0.1 for this-machine-only).
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { createRequire } from "node:module";

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, "data");
mkdirSync(dataDir, { recursive: true });

// ── Per-install secrets (generate once, then reuse) ───────────────────────────
// 48 random bytes → 96 hex chars, well past the backend's 32-byte minimum.
const secretsPath = join(dataDir, "secrets.json");
let secrets;
if (existsSync(secretsPath)) {
  secrets = JSON.parse(readFileSync(secretsPath, "utf8"));
} else {
  secrets = {
    LUMO_JWT_SECRET: randomBytes(48).toString("hex"),
    LUMO_ENCRYPTION_KEY: randomBytes(48).toString("hex"),
  };
  writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  // Best-effort tighten on POSIX; a no-op / harmless on Windows.
  try { chmodSync(secretsPath, 0o600); } catch { /* ignore */ }
}

// ── Backend environment ───────────────────────────────────────────────────────
const port = process.env.LUMO_PORT?.trim() || "47291";
const host = process.env.LUMO_HOST?.trim() || "0.0.0.0";

process.env.LUMO_JWT_SECRET = secrets.LUMO_JWT_SECRET;
process.env.LUMO_ENCRYPTION_KEY = secrets.LUMO_ENCRYPTION_KEY;
process.env.LUMO_PORT = port;
process.env.LUMO_HOST = host;
process.env.LUMO_DB_PATH = join(dataDir, "lumo.db");
// serveStatic resolves its root relative to cwd, and the SQLite "file:" path is
// also cwd-relative when not absolute — anchor cwd at the package root so both
// resolve deterministically no matter where the launcher was invoked from.
process.chdir(root);
process.env.LUMO_WEB_ROOT = "web";

// ── Friendly banner with the LAN address ──────────────────────────────────────
function lanAddress() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return null;
}
const lan = lanAddress();
console.log("");
console.log("  Lumo Task — local web server");
console.log("  ───────────────────────────");
console.log(`  This machine : http://localhost:${port}`);
if (host !== "127.0.0.1" && lan) {
  console.log(`  On your LAN  : http://${lan}:${port}   (others on the same Wi-Fi)`);
}
console.log("  Press Ctrl+C to stop.");
console.log("");

// ── Boot the server ───────────────────────────────────────────────────────────
// bundle.cjs reads the env we just set at module load, so require it last.
const require = createRequire(import.meta.url);
require(join(root, "bundle.cjs"));
