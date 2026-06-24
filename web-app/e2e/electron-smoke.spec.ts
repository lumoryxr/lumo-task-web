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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    await electronApp?.close().catch(() => {});
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
