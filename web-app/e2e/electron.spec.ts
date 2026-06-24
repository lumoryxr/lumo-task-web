/**
 * Electron (Windows desktop) UI integration tests.
 *
 * One shared Electron instance.  beforeAll verifies the app shows onboarding
 * on a fresh start, then registers a real user via the embedded backend API,
 * injects auth via addInitScript + reload, and waits for the shell.
 *
 * All subsequent tests exercise the authenticated Windows desktop app:
 *   OB01         Onboarding appears on first launch (asserted in beforeAll setup)
 *   WIN01–WIN03  Window title, visibility, minimize/restore
 *   NAV01–NAV07  Every page reachable (hash navigation to avoid Playwright-Electron
 *                "step id not found" from React-Router link clicks)
 *   TODAY01–TODAY03  Today page + Quick Add modal
 *   TASK01–TASK02    Task CRUD via embedded backend API
 *   MATRIX01–MATRIX03  Quadrants, calendar view, API-seeded task
 *   FOCUS01–FOCUS04  Timer, DND, controls
 *   SET01–SET10  Settings: all 8 tabs including Electron-only Storage tab
 *   HAB01–HAB04  Habits: load, add modal, create, checkbox
 *   STAT01–STAT03  Stats: This week, All time, stat cards
 *   CD01–CD02    Countdown: load, add modal
 *   ACC01–ACC04  Account page, Change password form
 *
 * Note: step-by-step onboarding wizard click-through is covered exhaustively
 * by ui.spec.ts (TC01–TC11).  Electron tests focus on what is unique to the
 * Windows desktop: real SQLite backend, Electron window controls, and the
 * Electron-specific Storage tab.
 *
 * Prerequisites:
 *   npm run build  (web-app/ → dist/   and   backend/ → dist/bundle.cjs)
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

/** Navigate via hash — avoids a Playwright-Electron "step id not found" issue
 *  that occurs when React-Router nav-link clicks update the hash. */
async function goto(page: Page, hash: string) {
  await page.evaluate((h: string) => { (window as any).location.hash = h; }, hash);
  await page.waitForTimeout(400);
}

test.describe("Electron app", () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let backendPort: number;

  // Records whether the app showed onboarding before auth was injected.
  let onboardingShownOnFreshStart = false;

  test.beforeAll(async () => {
    // Scrub the secrets the desktop app must provision itself. In a real
    // packaged install LUMO_ENCRYPTION_KEY / LUMO_JWT_SECRET are absent from the
    // environment, so the embedded backend's boot check ("LUMO_ENCRYPTION_KEY
    // must be set") only passes if main.cjs generates and injects them. Removing
    // them here turns this suite into a regression guard for the
    // packaged-app-won't-start bug (backend exited 1 → window never appeared).
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

    // Clear any leftover localStorage so onboarding would show.
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // Record whether onboarding is shown (used in OB01 test).
    onboardingShownOnFreshStart = await page
      .getByText("Welcome to Lumo")
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    // Register a unique user directly via the embedded backend.
    const email = `electron-e2e-${Date.now()}@lumo.test`;
    const authData = await page.evaluate(
      async ({ email, port }: { email: string; port: number }) => {
        const r = await fetch(`http://127.0.0.1:${port}/v1/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: "E2eTest!23", name: "E2E Tester" }),
        });
        if (!r.ok) return null;
        return r.json() as Promise<{ token: string; user: object }>;
      },
      { email, port: backendPort }
    );

    if (!authData) throw new Error(`Registration failed on port ${backendPort}`);

    // Use addInitScript so localStorage is set BEFORE any page JS runs on reload.
    await page.addInitScript(
      (arg: { token: string; user: object }) => {
        localStorage.setItem(
          "lumo.app.v1",
          JSON.stringify({
            state: {
              locale: "en",
              accent: "green",
              density: "comfortable",
              reducedMotion: false,
              onboarded: true,
            },
            version: 0,
          })
        );
        localStorage.setItem(
          "lumo.auth.v1",
          JSON.stringify({ state: { user: arg.user }, version: 0 })
        );
        localStorage.setItem("lumo.token", arg.token);
      },
      { token: authData.token, user: authData.user }
    );

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("link", { name: /today/i }).waitFor({ timeout: 30_000 });
  });

  test.afterAll(async () => {
    await electronApp.close().catch(() => {});
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Onboarding  (assertion recorded in beforeAll)
  // ─────────────────────────────────────────────────────────────────────────

  test("OB01 – fresh launch (cleared localStorage) shows onboarding", async () => {
    expect(onboardingShownOnFreshStart).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Embedded backend boot (regression guard: packaged app self-provisions
  // LUMO_ENCRYPTION_KEY / LUMO_JWT_SECRET — env was scrubbed in beforeAll)
  // ─────────────────────────────────────────────────────────────────────────

  test("BOOT01 – embedded backend started and is reachable (self-provisioned secrets)", async () => {
    const status = await page.evaluate(async (port: number) => {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      return r.status;
    }, backendPort);
    expect(status).toBe(200);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Window basics
  // ─────────────────────────────────────────────────────────────────────────

  test("WIN01 – window title contains 'Lumo'", async () => {
    await expect(page).toHaveTitle(/lumo/i);
  });

  test("WIN02 – window is visible and not minimised", async () => {
    const visible = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win ? !win.isMinimized() && win.isVisible() : false;
    });
    expect(visible).toBe(true);
  });

  test("WIN03 – window can be minimised and restored", async () => {
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.minimize();
    });
    await page.waitForTimeout(500);
    const minimised = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isMinimized() ?? false
    );
    expect(minimised).toBe(true);

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.restore();
    });
    await page.waitForTimeout(500);
    const restored = await electronApp.evaluate(({ BrowserWindow }) =>
      !(BrowserWindow.getAllWindows()[0]?.isMinimized() ?? true)
    );
    expect(restored).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Navigation  (all via location.hash)
  // ─────────────────────────────────────────────────────────────────────────

  test("NAV01 – Today page loads with its content", async () => {
    await goto(page, "/today");
    await expect(
      page.getByText("Recommended")
        .or(page.getByText("Nothing planned yet"))
        .or(page.getByText("Today's plan"))
    ).toBeVisible({ timeout: 8_000 });
  });

  test("NAV02 – Matrix page loads with four quadrant headers", async () => {
    await goto(page, "/matrix");
    await expect(page.getByText("Do first")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("Schedule")).toBeVisible();
    await expect(page.getByText("Delegate")).toBeVisible();
    await expect(page.getByText("Drop")).toBeVisible();
  });

  test("NAV03 – Focus page loads with timer", async () => {
    await goto(page, "/focus");
    await expect(page.getByText(/\d{1,2}:\d{2}/).first()).toBeVisible({ timeout: 8_000 });
  });

  test("NAV04 – Settings page loads with Appearance heading", async () => {
    await goto(page, "/settings");
    await expect(page.getByText("Appearance")).toBeVisible({ timeout: 8_000 });
  });

  test("NAV05 – Stats page loads with This week section", async () => {
    await goto(page, "/stats");
    await expect(page.getByText(/this week/i)).toBeVisible({ timeout: 8_000 });
  });

  test("NAV06 – Habits page loads with heading", async () => {
    await goto(page, "/habits");
    await expect(page.getByText("Habits").first()).toBeVisible({ timeout: 8_000 });
  });

  test("NAV07 – Countdown page loads with heading", async () => {
    await goto(page, "/countdown");
    await expect(page.getByText(/countdown/i).first()).toBeVisible({ timeout: 8_000 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Today page
  // ─────────────────────────────────────────────────────────────────────────

  test("TODAY01 – Today page renders shell content", async () => {
    await goto(page, "/today");
    await expect(
      page.getByText("Recommended")
        .or(page.getByText("Nothing planned yet"))
        .or(page.getByText("Today's plan"))
    ).toBeVisible({ timeout: 8_000 });
  });

  test("TODAY02 – Quick Add modal opens from topbar", async () => {
    await expect(page.getByRole("button", { name: /quick add/i })).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /quick add/i }).click();
    await expect(page.getByPlaceholder(/what needs doing/i)).toBeVisible({ timeout: 5_000 });
  });

  test("TODAY03 – Quick Add Create button closes the modal", async () => {
    await page.getByPlaceholder(/what needs doing/i).fill("Electron journey task");
    await page.getByRole("button", { name: /^create$/i }).click();
    await expect(page.getByPlaceholder(/what needs doing/i)).not.toBeVisible({ timeout: 5_000 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Task CRUD via embedded backend API
  // ─────────────────────────────────────────────────────────────────────────

  test("TASK01 – task created via API appears in Today plan", async () => {
    const token = await page.evaluate(() => localStorage.getItem("lumo.token")) as string;
    const title = `API Today Task ${Date.now()}`;

    await page.evaluate(
      async ({ port, token, title }: { port: number; token: string; title: string }) => {
        await fetch(`http://127.0.0.1:${port}/v1/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: { en: title }, quadrant: "Q1", today: true }),
        });
      },
      { port: backendPort, token, title }
    );

    await goto(page, "/today");
    await page.waitForTimeout(1_000);
    await expect(page.getByText(title)).toBeVisible({ timeout: 8_000 });
  });

  test("TASK02 – complete task button removes it from active task view", async () => {
    const token = await page.evaluate(() => localStorage.getItem("lumo.token")) as string;
    const title = `Complete Me ${Date.now()}`;

    await page.evaluate(
      async ({ port, token, title }: { port: number; token: string; title: string }) => {
        await fetch(`http://127.0.0.1:${port}/v1/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: { en: title }, quadrant: "Q1", today: true }),
        });
      },
      { port: backendPort, token, title }
    );

    await goto(page, "/today");
    await expect(page.getByText(title)).toBeVisible({ timeout: 8_000 });

    const completeBtn = page.getByRole("button", { name: /complete task/i }).first();
    if (await completeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await completeBtn.click();
      await expect(completeBtn).not.toBeVisible({ timeout: 5_000 });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Matrix
  // ─────────────────────────────────────────────────────────────────────────

  test("MATRIX01 – all four quadrant headers visible", async () => {
    await goto(page, "/matrix");
    await expect(page.getByText("Do first")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("Schedule")).toBeVisible();
    await expect(page.getByText("Delegate")).toBeVisible();
    await expect(page.getByText("Drop")).toBeVisible();
  });

  test("MATRIX02 – calendar view toggle shows week-day columns and returns", async () => {
    const calBtn = page.getByRole("button", { name: /calendar/i });
    if (await calBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await calBtn.click();
      await expect(
        page.getByText(/sun|mon|tue|wed|thu|fri|sat/i).first()
      ).toBeVisible({ timeout: 5_000 });
      await page.getByRole("button", { name: /^matrix$/i }).click();
      await expect(page.getByText("Do first")).toBeVisible({ timeout: 5_000 });
    }
  });

  test("MATRIX03 – API-created Q2 task appears in Schedule quadrant", async () => {
    const token = await page.evaluate(() => localStorage.getItem("lumo.token")) as string;
    const title = `Schedule Task ${Date.now()}`;

    await page.evaluate(
      async ({ port, token, title }: { port: number; token: string; title: string }) => {
        await fetch(`http://127.0.0.1:${port}/v1/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: { en: title }, quadrant: "Q2" }),
        });
      },
      { port: backendPort, token, title }
    );

    await goto(page, "/matrix");
    await expect(page.getByText(title)).toBeVisible({ timeout: 8_000 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Focus
  // ─────────────────────────────────────────────────────────────────────────

  test("FOCUS01 – focus page shows timer in MM:SS format", async () => {
    await goto(page, "/focus");
    await expect(page.getByText(/\d{1,2}:\d{2}/).first()).toBeVisible({ timeout: 8_000 });
  });

  test("FOCUS02 – 'Do not disturb' label is visible", async () => {
    await expect(page.getByText("Do not disturb")).toBeVisible({ timeout: 5_000 });
  });

  test("FOCUS03 – pause / resume or empty-state message renders", async () => {
    await expect(
      page.getByRole("button", { name: /pause|resume|mark complete/i })
        .or(page.getByText("Nothing to focus on"))
    ).toBeVisible({ timeout: 8_000 });
  });

  test("FOCUS04 – 'Mark complete' button or empty state present", async () => {
    await expect(
      page.getByRole("button", { name: /mark complete/i })
        .or(page.getByText("Nothing to focus on"))
    ).toBeVisible({ timeout: 5_000 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Settings — all tabs
  // ─────────────────────────────────────────────────────────────────────────

  test("SET01 – Appearance tab shows Comfortable / Compact density controls", async () => {
    await goto(page, "/settings");
    await expect(page.getByText("Appearance")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("Comfortable")).toBeVisible();
    await expect(page.getByText("Compact")).toBeVisible();
  });

  test("SET02 – Appearance tab has Reduced motion toggle", async () => {
    await expect(page.getByText(/reduced motion/i)).toBeVisible({ timeout: 5_000 });
  });

  test("SET03 – Language tab shows English and 中文 options", async () => {
    await page.getByRole("button", { name: /language/i }).click();
    await expect(page.getByText(/english/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("中文")).toBeVisible();
  });

  test("SET04 – switching locale to 中文 and back to English works", async () => {
    await page.getByText("中文").click();
    await expect(page.getByText("中文")).toBeVisible({ timeout: 3_000 });
    await page.getByText(/english/i).click();
    await expect(page.getByText(/english/i)).toBeVisible({ timeout: 3_000 });
  });

  test("SET05 – Members tab shows 'Add member' button", async () => {
    await page.getByRole("button", { name: /members/i }).click();
    await expect(page.getByRole("button", { name: /add member/i })).toBeVisible({ timeout: 5_000 });
  });

  test("SET06 – Storage tab shows database location (Electron-specific)", async () => {
    const storageTab = page.getByRole("button", { name: /storage/i });
    if (await storageTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await storageTab.click();
      await expect(
        page.getByText(/database location|lumo\.db|show in/i).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("SET07 – Sync tab shows cloud sync section", async () => {
    const syncTab = page.getByRole("button", { name: /^sync$/i });
    if (await syncTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await syncTab.click();
      await expect(
        page.getByText(/cloud sync|turso|remote replica/i).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("SET08 – AI tab shows provider / model controls", async () => {
    const aiTab = page.getByRole("button", { name: /^AI$/i });
    if (await aiTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await aiTab.click();
      await expect(
        page.getByText(/openai|provider|model|api key/i).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("SET09 – Data tab shows 'Replay onboarding' button", async () => {
    await page.getByRole("button", { name: /data/i }).click();
    await expect(page.getByRole("button", { name: /replay onboarding/i })).toBeVisible({
      timeout: 5_000,
    });
  });

  test("SET10 – Data tab shows 'Reset demo data' button", async () => {
    await expect(
      page.getByRole("button", { name: /reset/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Habits
  // ─────────────────────────────────────────────────────────────────────────

  test("HAB01 – Habits page loads with heading", async () => {
    await goto(page, "/habits");
    await expect(page.getByText("Habits").first()).toBeVisible({ timeout: 8_000 });
  });

  test("HAB02 – 'Add' button opens habit creation modal with name input", async () => {
    const addBtn = page.getByRole("button", { name: /add/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 5_000 });
    await addBtn.click();
    await expect(page.locator("input").first()).toBeVisible({ timeout: 5_000 });
    const cancelBtn = page.getByRole("button", { name: /cancel/i });
    if (await cancelBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }
  });

  test("HAB03 – create a habit and verify it appears in the list", async () => {
    const addBtn = page.getByRole("button", { name: /add/i }).first();
    await addBtn.click();
    await expect(page.locator("input").first()).toBeVisible({ timeout: 5_000 });
    await page.locator("input").first().fill("Daily meditation");
    await page.getByRole("button", { name: /save|create|add/i }).first().click();
    await expect(page.getByText("Daily meditation")).toBeVisible({ timeout: 8_000 });
  });

  test("HAB04 – habit card shows a completion checkbox", async () => {
    await expect(page.getByText("Daily meditation")).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator('input[type="checkbox"]').or(page.getByRole("checkbox")).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Stats
  // ─────────────────────────────────────────────────────────────────────────

  test("STAT01 – Stats page shows 'This week' section", async () => {
    await goto(page, "/stats");
    await expect(page.getByText(/this week/i)).toBeVisible({ timeout: 8_000 });
  });

  test("STAT02 – Stats page shows 'All time' section", async () => {
    await expect(page.getByText(/all time/i)).toBeVisible({ timeout: 5_000 });
  });

  test("STAT03 – Tasks, Focus, and Streak stat cards are visible", async () => {
    await expect(page.getByText(/tasks/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/focus|hours/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/streak/i).first()).toBeVisible({ timeout: 5_000 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Countdown
  // ─────────────────────────────────────────────────────────────────────────

  test("CD01 – Countdown page loads with heading", async () => {
    await goto(page, "/countdown");
    await expect(page.getByText(/countdown/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("CD02 – 'Add' button opens countdown creation modal", async () => {
    const addBtn = page.getByRole("button", { name: /add/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 5_000 });
    await addBtn.click();
    await expect(page.locator("input").first()).toBeVisible({ timeout: 5_000 });
    const cancelBtn = page.getByRole("button", { name: /cancel/i });
    if (await cancelBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Account
  // ─────────────────────────────────────────────────────────────────────────

  test("ACC01 – Account page shows signed-in user's email", async () => {
    await goto(page, "/account");
    await expect(page.getByText("Account").first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/lumo\.test/i)).toBeVisible({ timeout: 5_000 });
  });

  test("ACC02 – Account page has a 'Sign out' button", async () => {
    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible({ timeout: 5_000 });
  });

  test("ACC03 – Change password form shows 3 password inputs", async () => {
    await goto(page, "/account/change-password");
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('input[type="password"]')).toHaveCount(3, { timeout: 5_000 });
    await goto(page, "/account");
  });

  test("ACC04 – Account page shows Profile / Usage sections", async () => {
    await goto(page, "/account");
    await expect(page.getByText("Account").first()).toBeVisible({ timeout: 8_000 });
    await expect(
      page.getByText(/profile|usage|tasks|pomodoros/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});
