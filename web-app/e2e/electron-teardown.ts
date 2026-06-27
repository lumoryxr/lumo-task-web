/**
 * Shared cross-platform teardown for launched Electron apps in the smoke suites.
 *
 * Electron spawns the embedded backend as a child process (which under
 * LUMO_USE_DIST may itself fork tsx→node). Killing only the Electron pid orphans
 * the backend; it keeps its stdio pipe / API port open and stalls the Playwright
 * worker until the teardown deadline trips — failing an otherwise-green suite.
 * So we reap the WHOLE process tree: POSIX walks `pgrep -P` and SIGKILLs each
 * node; Windows (no pgrep/SIGKILL) uses `taskkill /T /F` by root pid.
 */
import { execSync } from "child_process";
import type { ElectronApplication } from "@playwright/test";

/** Breadth-first descendant pid tree of `rootPid` via `pgrep -P` (POSIX only). */
function collectDescendants(rootPid: number): number[] {
  const all: number[] = [];
  const stack = [rootPid];
  while (stack.length) {
    const pid = stack.pop();
    if (pid === undefined) break;
    let children: number[] = [];
    try {
      const out = execSync(`pgrep -P ${pid}`, { encoding: "utf8" }).trim();
      children = out
        ? out.split("\n").map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n))
        : [];
    } catch {
      // pgrep exits 1 (no children) — nothing to add for this pid.
      children = [];
    }
    for (const c of children) {
      all.push(c);
      stack.push(c);
    }
  }
  return all;
}

/**
 * Gracefully close a launched Electron app, then force-kill its whole process
 * tree (Electron + orphan-prone embedded backend + children) so no lingering
 * pipe/port blocks Playwright worker teardown. Safe to call with `undefined`.
 */
export async function shutdownElectron(app: ElectronApplication | undefined): Promise<void> {
  if (!app) return;
  const rootPid = app.process()?.pid;
  // Snapshot descendants while Electron is still alive and parents them (POSIX).
  const descendants =
    rootPid && process.platform !== "win32" ? collectDescendants(rootPid) : [];
  await Promise.race([
    app.close().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 15_000)),
  ]);
  if (!rootPid) return;
  if (process.platform === "win32") {
    // taskkill walks and kills the child tree (/T) forcefully (/F). After a
    // graceful close this is a harmless backstop (the tree is already gone).
    try {
      execSync(`taskkill /pid ${rootPid} /T /F`, { stdio: "ignore" });
    } catch {
      /* already gone */
    }
    return;
  }
  // POSIX: reap children first, then the root, so nothing holds a handle.
  for (const pid of [...descendants, rootPid]) {
    if (!pid) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}
