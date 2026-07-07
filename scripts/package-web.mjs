/**
 * Assemble the self-contained local/LAN **web** package.
 *
 * Produces a folder that runs the whole app as ONE process on ONE port (the
 * backend serves the built SPA + the /v1 API — see backend/src/lib/webStatic.ts):
 *
 *   <out>/
 *     bundle.cjs        backend server (esbuild bundle)
 *     launcher.mjs      generates per-install secrets, sets env, boots bundle.cjs
 *     start.bat         double-click entry: `node.exe launcher.mjs`
 *     web/              built frontend (VITE_API_BASE=/v1, same-origin)
 *     node_modules/     libsql native deps (platform-specific — see note)
 *     node.exe          bundled Node runtime — added by the Windows CI workflow
 *     data/             created at runtime: secrets.json, lumo.db
 *
 * PLATFORM NOTE: the libsql native binaries under node_modules are
 * platform-specific. Run this on the TARGET platform after a clean install so
 * the correct binaries are copied. The shipping Windows artifact is built by
 * .github/workflows/package-web-windows.yml on a Windows runner (clean
 * `npm ci`, then `node.exe` fetched and zipped). Running it on Linux yields a
 * structurally-correct package with Linux binaries — useful for validating the
 * layout, not for shipping to Windows.
 *
 * Usage:  node scripts/package-web.mjs [--out <dir>] [--skip-build]
 */
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outArg = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const skipBuild = args.includes("--skip-build");
const outDir = resolve(outArg || join(root, "dist-web", "LumoTask-Web"));

// libsql native deps to carry, mirroring the proven electron-builder copy list
// (web-app/package.json → build.extraResources). Each is optional per platform.
const NATIVE_DEPS = ["@libsql", "libsql", "@neon-rs", "detect-libc"];

function run(cmd, cwd, env = {}) {
  console.log(`  $ ${cmd}   (${cwd})`);
  execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
}

console.log(`\n▶ Packaging Lumo web app → ${outDir}\n`);

// ── 1. Build ──────────────────────────────────────────────────────────────────
if (!skipBuild) {
  console.log("① Building backend bundle…");
  run("npm run build", join(root, "backend"));
  console.log("② Building frontend (same-origin VITE_API_BASE=/v1)…");
  run("npm run build", join(root, "web-app"), { VITE_API_BASE: "/v1" });
} else {
  console.log("① ② Skipping build (--skip-build)");
}

// ── 2. Assemble ───────────────────────────────────────────────────────────────
console.log("\n③ Assembling package…");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const backendBundle = join(root, "backend", "dist", "bundle.cjs");
if (!existsSync(backendBundle)) {
  console.error(`✗ Missing ${backendBundle} — run without --skip-build first.`);
  process.exit(1);
}
cpSync(backendBundle, join(outDir, "bundle.cjs"));
cpSync(join(root, "packaging", "web", "launcher.mjs"), join(outDir, "launcher.mjs"));
cpSync(join(root, "packaging", "web", "start.bat"), join(outDir, "start.bat"));
cpSync(join(root, "packaging", "web", "README.txt"), join(outDir, "README.txt"));

const frontendDist = join(root, "web-app", "dist");
if (!existsSync(frontendDist)) {
  console.error(`✗ Missing ${frontendDist} — run without --skip-build first.`);
  process.exit(1);
}
cpSync(frontendDist, join(outDir, "web"), { recursive: true });

const nmSrc = join(root, "backend", "node_modules");
const nmOut = join(outDir, "node_modules");
let copied = 0;
for (const dep of NATIVE_DEPS) {
  const src = join(nmSrc, dep);
  if (existsSync(src)) {
    cpSync(src, join(nmOut, dep), { recursive: true });
    copied++;
  } else {
    console.warn(`  ⚠ native dep not found (skipped): node_modules/${dep}`);
  }
}
if (copied === 0) {
  console.error(
    "✗ No libsql native deps copied — the server cannot open its database.\n" +
    "  Run a clean install in backend/ first (npm ci), on the target platform."
  );
  process.exit(1);
}

// ── 3. Report ─────────────────────────────────────────────────────────────────
const hasNode = existsSync(join(outDir, "node.exe"));
console.log("\n✓ Package assembled:");
for (const entry of readdirSync(outDir)) console.log(`    ${entry}`);
console.log(
  `\n  Native deps copied: ${copied}/${NATIVE_DEPS.length}` +
  `\n  Bundled node.exe  : ${hasNode ? "present" : "NOT yet (added by the Windows CI workflow)"}` +
  `\n\n  To ship: add node.exe (Windows x64) and zip the folder.` +
  `\n  End user: unzip → double-click start.bat → browser opens http://localhost:47291\n`
);
