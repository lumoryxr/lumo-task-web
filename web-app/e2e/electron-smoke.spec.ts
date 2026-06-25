/**
 * Minimal Electron desktop SMOKE test — runs on every PR (electron-smoke.yml).
 *
 * Purpose: cheaply and RELIABLY guard, on every commit, that the packaged
 * desktop app LAUNCHES and its embedded backend STARTS. The launch env scrubs
 * LUMO_ENCRYPTION_KEY / LUMO_JWT_SECRET, so this only passes if main.cjs
 * self-provisions them — catching the "Refusing to start: LUMO_ENCRYPTION_KEY
 * must be set" class of bug that bricked a packaged install.
 *
 * Deliberately tiny: launch + backend /health + frontend renders. The exhaustive
 * authenticated UI walkthrough (auth injection + 40+ navigations) lives in
 * electron.spec.ts, which is heavier / environment-sensitive and runs via
 * `make test-integration electron` (daily / on demand), not on the per-PR path.
 */

import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Collect the full descendant pid tree of `rootPid` (children, grandchildren, …)
 * by walking `pgrep -P` breadth-first. Electron spawns the embedded backend as a
 * child process (which under LUMO_USE_DIST may itself fork tsx→node), so killing
 * only the Electron pid orphans the backend; it keeps its stdio pipe / API port
 * open and stalls the Playwright worker until the 90s teardown deadline trips —
 * failing an otherwise-green suite. We capture the tree while Electron is still
 * alive (descendants are still reachable from it) so we can reap every node.
 */
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

const MAIN_CJS = path.resolve(__dirname, "../electron/main.cjs");
const APP_DIR = path.resolve(__dirname, "..");

test.describe("Electron desktop smoke", () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let backendPort: number;

  test.beforeAll(async () => {
    // Scrub the secrets the desktop app must provision itself. In a real
    // packaged install LUMO_ENCRYPTION_KEY / LUMO_JWT_SECRET are absent, so the
    // embedded backend only starts if main.cjs generates and injects them.
    const scrubbedEnv = { ...process.env };
    delete scrubbedEnv.LUMO_ENCRYPTION_KEY;
    delete scrubbedEnv.LUMO_JWT_SECRET;

    electronApp = await electron.launch({
      args: [MAIN_CJS],
      cwd: APP_DIR,
      env: {
        ...scrubbedEnv,
        NODE_ENV: "test",
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
        LUMO_USE_DIST: "1",
      },
    });

    page = await electronApp.firstWindow({ timeout: 60_000 });
    await page.waitForLoadState("domcontentloaded");

    backendPort = await page.evaluate(() =>
      (window as unknown as { electronAPI: { getApiPort: () => Promise<number> } })
        .electronAPI.getApiPort()
    );
  });

  test.afterAll(async () => {
    if (!electronApp) return;
    // electronApp.close() relies on a graceful app.quit(). Under xvfb in CI the
    // embedded-backend child process can keep the Electron process alive past
    // the teardown budget, hanging the worker and failing an otherwise-green
    // suite (the render assertions all pass first). Race the graceful close
    // against a short deadline, then force-kill the ENTIRE process tree —
    // Electron AND the orphan-prone embedded backend (+ its own children) — so
    // no lingering pipe/port can block worker teardown.
    const proc = electronApp.process();
    const rootPid = proc?.pid;
    // Snapshot descendants while Electron is still alive and parents them.
    const descendants = rootPid ? collectDescendants(rootPid) : [];
    await Promise.race([
      electronApp.close().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 15_000)),
    ]);
    // Reap children first, then the root, so nothing is left holding a handle.
    for (const pid of [...descendants, rootPid]) {
      if (!pid) continue;
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* process already gone */
      }
    }
  });

  test("SMOKE01 – embedded backend started and is reachable (self-provisioned secrets)", async () => {
    // The crux of the regression guard: with the secrets scrubbed above, the
    // backend only answers if main.cjs provisioned LUMO_ENCRYPTION_KEY itself.
    const status = await page.evaluate(async (port: number) => {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      return r.status;
    }, backendPort);
    expect(status).toBe(200);
  });

  test("SMOKE02 – desktop window opened with the Lumo title", async () => {
    await expect(page).toHaveTitle(/lumo/i);
  });

  test("SMOKE03 – frontend renders (onboarding welcome screen on fresh launch)", async () => {
    await expect(page.getByText("Welcome to Lumo")).toBeVisible({ timeout: 15_000 });
  });
});
