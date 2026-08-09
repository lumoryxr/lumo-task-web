/**
 * Electron desktop — local data persistence across an app RESTART.
 *
 * The core local-first guarantee of the desktop app: data written in one
 * session is still there after the user quits and relaunches. This drives the
 * real bundled backend + SQLite file end to end:
 *
 *   Launch #1 → register a user + create a task → quit.
 *   Launch #2 (same userData/db) → sign in + read tasks → the task is still there.
 *
 * Both launches share one temp `--user-data-dir`, so they hit the same SQLite
 * file (and the same self-provisioned jwt/encryption keys persisted beside it).
 * Secrets are scrubbed from the env, so this also re-proves main.cjs provisions
 * them. Runs via playwright.electron-smoke.config.ts (per-PR on Linux, and the
 * Windows release gate).
 */

import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import path from "path";
import os from "os";
import fs from "fs";
import { fileURLToPath } from "url";
import { shutdownElectron } from "./electron-teardown";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAIN_CJS = path.resolve(__dirname, "../electron/main.cjs");
const APP_DIR = path.resolve(__dirname, "..");

// Shared across the two launches in this serial suite.
const userDataDir = path.join(os.tmpdir(), `lumo-e2e-persist-${process.pid}`);
// Auth is username-first (commit 1945fba): register/signin take { username, password }.
const creds = { username: `persist${Date.now()}`, password: "E2eTest!23" };
const taskTitle = `persist-task-${Date.now()}`;

/** Launch the desktop app against the shared temp userData dir (scrubbed secrets). */
async function launch(): Promise<{ app: ElectronApplication; page: Page; port: number }> {
  const env = { ...process.env };
  delete env.LUMO_ENCRYPTION_KEY;
  delete env.LUMO_JWT_SECRET;

  const app = await electron.launch({
    args: [MAIN_CJS, `--user-data-dir=${userDataDir}`],
    cwd: APP_DIR,
    env: { ...env, NODE_ENV: "test", ELECTRON_DISABLE_SECURITY_WARNINGS: "true", LUMO_USE_DIST: "1" },
  });
  const page = await app.firstWindow({ timeout: 60_000 });
  await page.waitForLoadState("domcontentloaded");
  const port = await page.evaluate(() =>
    (window as unknown as { electronAPI: { getApiPort: () => Promise<number> } })
      .electronAPI.getApiPort()
  );
  return { app, page, port };
}

/**
 * Reap the app + its embedded-backend process tree (shutdownElectron), then wait
 * for the OS to release the SQLite file handle before the next launch reopens it.
 */
async function shutdown(app: ElectronApplication): Promise<void> {
  await shutdownElectron(app);
  await new Promise((resolve) => setTimeout(resolve, 1_500));
}

test.afterAll(() => {
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

test.describe.serial("Electron desktop persistence (restart)", () => {
  test("PERSIST01 – first launch: register a user and create a task", async () => {
    const { app, page, port } = await launch();
    try {
      const outcome = await page.evaluate(
        async ({ port, username, password, title }: { port: number; username: string; password: string; title: string }) => {
          const base = `http://127.0.0.1:${port}/v1`;
          const reg = await fetch(`${base}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          if (!reg.ok) return { step: "register", status: reg.status };
          const { token } = (await reg.json()) as { token: string };
          const create = await fetch(`${base}/tasks`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ title: { en: title } }),
          });
          if (!create.ok) return { step: "create", status: create.status };
          return { step: "ok" as const };
        },
        { port, ...creds, title: taskTitle }
      );
      expect(outcome.step, `failed at "${outcome.step}" (status ${outcome.status ?? "-"})`).toBe("ok");
    } finally {
      await shutdown(app);
    }
  });

  test("PERSIST02 – second launch (same db): the task survived the restart", async () => {
    const { app, page, port } = await launch();
    try {
      const outcome = await page.evaluate(
        async ({ port, username, password, title }: { port: number; username: string; password: string; title: string }) => {
          const base = `http://127.0.0.1:${port}/v1`;
          // Same credentials must still authenticate — the user row persisted.
          const signin = await fetch(`${base}/auth/signin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          if (!signin.ok) return { step: "signin", status: signin.status, found: false };
          const { token } = (await signin.json()) as { token: string };
          const list = await fetch(`${base}/tasks`, { headers: { Authorization: `Bearer ${token}` } });
          if (!list.ok) return { step: "list", status: list.status, found: false };
          const { items } = (await list.json()) as { items: Array<{ title: { en: string } }> };
          return { step: "ok" as const, found: items.some((t) => t.title?.en === title) };
        },
        { port, ...creds, title: taskTitle }
      );
      expect(outcome.step, `failed at "${outcome.step}" (status ${outcome.status ?? "-"})`).toBe("ok");
      expect(outcome.found, "task created before restart was not found after relaunch").toBe(true);
    } finally {
      await shutdown(app);
    }
  });
});
