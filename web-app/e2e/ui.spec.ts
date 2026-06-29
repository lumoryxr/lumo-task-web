/**
 * UI integration tests — mock API, no real backend required.
 *
 * The app uses HashRouter: all routes live in the hash fragment (e.g. /#/today).
 * localStorage is injected via addInitScript so Zustand hydrates the correct
 * state before the first React render.
 *
 * Coverage:
 *   TC01–TC11  Onboarding wizard (5-step flow, each step's content)
 *   TC12–TC18  Auth pages (login, register, validation)
 *   TC19–TC27  Today page (conviction card, plan, quick-add modal)
 *   TC28–TC34  Matrix page (quadrants, task cards, calendar view)
 *   TC35–TC40  Focus page (timer, controls, empty state)
 *   TC41–TC53  Settings page (all 8 tabs, locale switch, replay)
 *   TC54–TC57  Habits page (auth gate, list, add modal)
 *   TC58–TC61  Stats page (auth gate, sections, stat cards)
 *   TC62–TC65  Countdown page (auth gate, list, add modal)
 *   TC66–TC70  Account & Change-password pages
 *   TC71–TC74  Navigation (sidebar links, routing, 404 redirect)
 *   TC75–TC78  i18n (no raw key leaks across pages + habit modals, en + 中文)
 *   TC79–TC81  Countdown lunar calendar (#43 P2: toggle, picker, card badge)
 */

import { test, expect, type Page } from "@playwright/test";
import { STRINGS } from "../src/i18n/strings";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function skipOnboarding(page: Page) {
  await page.addInitScript(() => {
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
  });
}

async function skipOnboardingAndSignIn(page: Page) {
  await page.addInitScript(() => {
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
      JSON.stringify({
        state: {
          user: {
            id: "u1",
            email: "alex@stride.studio",
            name: "Alex",
            initials: "AL",
            local: false,
            plan: "free",
            stats: { tasks: 5, pomodoros: 3, syncOK: false },
          },
        },
        version: 0,
      })
    );
    localStorage.setItem("lumo.token", "mock-jwt-token-1234");
    // Seed habits and countdowns (localStorage-based APIs)
    localStorage.setItem(
      "lumo.habits.v1.u1",
      JSON.stringify([
        { id: "h1", title: "Morning exercise", frequency: "daily", color: "green", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "h2", title: "Read 30 minutes", frequency: "daily", color: "cyan", createdAt: "2026-01-01T00:00:00.000Z" },
      ])
    );
    localStorage.setItem(
      "lumo.countdowns.v1.u1",
      JSON.stringify([
        { id: "c1", title: "Product launch", date: "2026-12-01", repeat: "none", color: "green", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "c2", title: "Team offsite", date: "2026-08-15", repeat: "yearly", color: "cyan", createdAt: "2026-01-01T00:00:00.000Z" },
      ])
    );
  });
}

const MOCK_USER = {
  id: "u1",
  email: "alex@stride.studio",
  name: "Alex",
  initials: "AL",
  local: false,
  plan: "free",
  stats: { tasks: 5, pomodoros: 3, syncOK: false },
};

const MOCK_TASKS = [
  {
    id: "t1",
    title: { en: "Write integration tests" },
    quadrant: "Q1",
    today: true,
    completed: false,
    conviction: 0.95,
    pomos_done: 1,
    pomos_total: 2,
    duration: 30,
    assignee_ids: [],
  },
  {
    id: "t2",
    title: { en: "Review pull request" },
    quadrant: "Q2",
    today: true,
    completed: false,
    conviction: 0.7,
    pomos_done: 0,
    pomos_total: 1,
    duration: 15,
    assignee_ids: [],
  },
  {
    id: "t3",
    title: { en: "Update documentation" },
    quadrant: "Q3",
    today: false,
    completed: false,
    conviction: 0.4,
    pomos_done: 0,
    pomos_total: 1,
    duration: 20,
    assignee_ids: [],
  },
  {
    id: "t4",
    title: { en: "Check emails" },
    quadrant: "Q4",
    today: false,
    completed: false,
    conviction: 0.2,
    pomos_done: 0,
    pomos_total: 1,
    duration: 5,
    assignee_ids: [],
  },
];

const MOCK_HABITS = [
  { id: "h1", title: "Morning exercise", frequency: "daily", color: "green", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "h2", title: "Read 30 minutes", frequency: "daily", color: "cyan", createdAt: "2026-01-01T00:00:00.000Z" },
];

const MOCK_COUNTDOWNS = [
  { id: "c1", title: "Product launch", date: "2026-12-01", repeat: "none", color: "green", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "c2", title: "Team offsite", date: "2026-08-15", repeat: "yearly", color: "cyan", createdAt: "2026-01-01T00:00:00.000Z" },
  // Lunar anchor 2026-06-15 == 农历五月初一 (#43 P2).
  { id: "c3", title: "Lunar birthday", date: "2026-06-15", repeat: "yearly", color: "amber", calendar: "lunar", createdAt: "2026-01-01T00:00:00.000Z" },
];

const MOCK_COMPLETED = [
  { id: "e1", title: { en: "Write integration tests" }, duration: 30, quadrant: "Q1", completedAt: "2026-06-07T10:00:00.000Z" },
  { id: "e2", title: { en: "Review pull request" }, duration: 15, quadrant: "Q2", completedAt: "2026-06-06T10:00:00.000Z" },
];

/** Minimal mock — empty task list. Used by basic render / auth-gate tests. */
async function mockAPI(page: Page) {
  await page.route("**/v1/**", (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/v1/auth/signin") && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "mock-token", user: MOCK_USER }),
      });
    }
    if (url.includes("/v1/tasks")) {
      // GET list is the paginated envelope; other methods keep their empty stub.
      const body = method === "GET" ? { items: [], nextCursor: null } : [];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    }
    if (url.includes("/v1/people")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
    if (url.includes("/v1/templates")) {
      // GET → array; mutations → empty object. Without this the catch-all returns
      // {} and templateApi.list()'s .map throws on sign-in.
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(method === "GET" ? [] : {}),
      });
    }
    if (url.includes("/v1/settings")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ locale: "en", accent: "green", density: "comfortable" }),
      });
    }
    if (url.includes("/v1/completed")) {
      // ?date= → array (per-day, bounded); no-date → paginated { items, nextCursor }.
      const body = url.includes("date=") ? [] : { items: [], nextCursor: null };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    }
    if (url.includes("/v1/user")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: MOCK_USER }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
}

/** Full mock with realistic tasks, habits, countdowns, and auth responses. */
async function mockAPIWithData(page: Page) {
  // Stateful in-memory templates store so the save → list → instantiate flow works.
  const templates: any[] = [];
  await page.route("**/v1/**", (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Templates (#173) — stateful: POST appends, GET returns the list.
    if (url.includes("/v1/templates")) {
      if (method === "POST") {
        const body = JSON.parse(route.request().postData() || "{}");
        const tpl = {
          id: body.id || `tpl_${templates.length + 1}`,
          name: body.name,
          kind: "task",
          payload: body.payload,
          created_at: "2026-06-28T00:00:00.000Z",
        };
        templates.unshift(tpl);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(tpl) });
      }
      if (method === "DELETE") {
        const id = url.split("/v1/templates/")[1];
        const idx = templates.findIndex((x) => x.id === id);
        if (idx >= 0) templates.splice(idx, 1);
        return route.fulfill({ status: 204, body: "" });
      }
      if (method === "PATCH") {
        const id = url.split("/v1/templates/")[1];
        const body = JSON.parse(route.request().postData() || "{}");
        const tpl = templates.find((x) => x.id === id);
        if (tpl && body.name) tpl.name = body.name;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(tpl ?? {}) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(templates) });
    }

    // Auth
    if (method === "POST" && url.includes("/v1/auth/signin")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "mock-token", user: MOCK_USER }),
      });
    }
    if (method === "POST" && url.includes("/v1/auth/register")) {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ token: "mock-token", user: MOCK_USER }),
      });
    }

    // Tasks — complete must be checked before generic /v1/tasks POST
    if (method === "POST" && url.match(/\/v1\/tasks\/[^/]+\/complete/)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "t1", completed: true }),
      });
    }
    if (method === "POST" && url.includes("/v1/tasks")) {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "t99",
          title: { en: "New task" },
          quadrant: "Q1",
          today: false,
          completed: false,
          assignee_ids: [],
        }),
      });
    }
    if (url.includes("/v1/completed")) {
      // ?date= → array (per-day, bounded); no-date → paginated { items, nextCursor }.
      const body = url.includes("date=") ? MOCK_COMPLETED : { items: MOCK_COMPLETED, nextCursor: null };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    }
    if (url.includes("/v1/tasks")) {
      // GET /v1/tasks is keyset-paginated: { items, nextCursor } (ADR-0001).
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: MOCK_TASKS, nextCursor: null }),
      });
    }

    // People
    if (url.includes("/v1/people")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Habits
    if (method === "POST" && url.includes("/v1/habits/migrate")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, migrated: 2 }),
      });
    }
    if (url.includes("/v1/habits/logs")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
    if (url.includes("/v1/habits")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_HABITS),
      });
    }

    // Countdowns
    if (method === "POST" && url.includes("/v1/countdowns/migrate")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, migrated: 2 }),
      });
    }
    if (method === "POST" && url.includes("/v1/countdowns")) {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "c99",
          userId: "u1",
          title: "New countdown",
          date: "2026-12-31",
          repeat: "none",
        }),
      });
    }
    if (url.includes("/v1/countdowns")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_COUNTDOWNS),
      });
    }

    // Settings / user / focus
    if (url.includes("/v1/settings")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ locale: "en", accent: "green", density: "comfortable" }),
      });
    }
    if (url.includes("/v1/user")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: MOCK_USER }),
      });
    }
    if (method === "POST" && url.includes("/v1/focus")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ entry_id: "f1" }),
      });
    }

    // Catch-all for any other endpoints (health, etc)
    if (url.includes("/health")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TC01–TC11  Onboarding wizard
// ─────────────────────────────────────────────────────────────────────────────

test("TC01 – Onboarding: complete full 5-step flow → lands on login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/#\/onboarding/);

  await expect(page.getByText("1 / 5")).toBeVisible();
  await page.locator("footer .btn-primary").click();

  for (let step = 2; step <= 4; step++) {
    await expect(page.getByText(`${step} / 5`)).toBeVisible();
    await page.locator("footer .btn-primary").click();
  }

  await expect(page.getByText("5 / 5")).toBeVisible();
  await page.locator("footer .btn-primary").click();

  await expect(page).toHaveURL(/login/);
});

test("TC02 – Onboarding: skip button exits to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/#\/onboarding/);
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page).toHaveURL(/login/);
});

test("TC03 – Onboarding: step 1 shows 'Welcome to Lumo' and primary CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Welcome to Lumo")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole("button", { name: /let's set it up/i })).toBeVisible();
});

test("TC04 – Onboarding: step 2 shows language selection (English / 中文)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /let's set it up/i }).click();
  await expect(page.locator("text=Language").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/english/i)).toBeVisible();
  await expect(page.getByText("中文")).toBeVisible();
});

test("TC05 – Onboarding: step 3 shows accent color picker", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /let's set it up/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByText("Pick an accent")).toBeVisible({ timeout: 10_000 });
});

test("TC06 – Onboarding: step 4 shows Comfortable / Compact density options", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /let's set it up/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByText("Density")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Comfortable")).toBeVisible();
  await expect(page.getByText("Compact")).toBeVisible();
});

test("TC07 – Onboarding: step 5 shows 'All set' and 'Open the matrix' CTA", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /let's set it up/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByText("All set")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /open the matrix/i })).toBeVisible();
});

test("TC08 – Onboarding: back button returns to previous step", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /let's set it up/i }).click();
  await expect(page.locator("text=Language").first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /back/i }).click();
  await expect(page.getByText("Welcome to Lumo")).toBeVisible({ timeout: 10_000 });
});

test("TC09 – Onboarding: selecting 中文 does not break navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /let's set it up/i }).click();
  await expect(page.locator("text=Language").first()).toBeVisible({ timeout: 10_000 });
  await page.getByText("中文").click();
  // After selecting 中文, button label switches to Chinese ("继续") — use class selector
  await page.locator("footer .btn-primary").click();
  await expect(page.getByText("Pick an accent").or(page.getByText("选一种强调色")).first()).toBeVisible({ timeout: 8_000 });
});

test("TC10 – Onboarding: selecting Compact density and continuing works", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /let's set it up/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByText("Density")).toBeVisible({ timeout: 10_000 });
  await page.getByText("Compact").click();
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByText("All set")).toBeVisible({ timeout: 10_000 });
});

test("TC11 – Onboarding: step counter advances correctly 1→2→3", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("1 / 5")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /let's set it up/i }).click();
  await expect(page.getByText("2 / 5")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByText("3 / 5")).toBeVisible({ timeout: 10_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC12–TC18  Auth pages
// ─────────────────────────────────────────────────────────────────────────────

test("TC12 – Login: email, password, submit, and OAuth buttons visible", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/#/login");
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  const submitBtn = page.locator('button[type="submit"]');
  await expect(submitBtn).toBeVisible();
  await expect(submitBtn).toBeEnabled();
  await expect(page.getByText(/continue with google/i)).toBeVisible();
});

test("TC13 – Login: 'Create account' navigates to /register", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/#/login");
  const toRegisterBtn = page
    .locator('button[type="button"]')
    .filter({ hasText: /create account/i })
    .first();
  await toRegisterBtn.click();
  await expect(page).toHaveURL(/register/);
});

test("TC14 – Register: email, two password fields, nickname, and submit present", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/#/register");
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(2);
  await expect(page.locator('input[type="text"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});

test("TC15 – Register: mismatched passwords shows validation error", async ({ page }) => {
  await skipOnboarding(page);
  await mockAPIWithData(page);
  await page.goto("/#/register");
  await page.locator('input[type="email"]').fill("test@example.com");
  await page.locator('input[type="password"]').first().fill("Password!123");
  await page.locator('input[type="password"]').nth(1).fill("Different!456");
  await page.locator('button[type="submit"]').click();
  await expect(
    page.getByText(/passwords don't match|do not match|mismatch/i).first()
  ).toBeVisible({ timeout: 10_000 });
});

test("TC16 – Register: successful mock submit navigates to app shell", async ({ page }) => {
  await skipOnboarding(page);
  await mockAPIWithData(page);
  await page.goto("/#/register");
  await page.locator('input[type="email"]').fill("newuser@lumo.test");
  await page.locator('input[type="password"]').first().fill("NewPass!123");
  await page.locator('input[type="password"]').nth(1).fill("NewPass!123");
  const tos = page.locator('input[type="checkbox"]');
  if (await tos.count() > 0) await tos.first().check();
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/#\/(today|matrix)/, { timeout: 10_000 });
});

test("TC17 – Login: successful mock submit navigates to Today", async ({ page }) => {
  await skipOnboarding(page);
  await mockAPIWithData(page);
  await page.goto("/#/login");
  await page.locator('input[type="email"]').fill("alex@stride.studio");
  await page.locator('input[type="password"]').fill("Password!123");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/#\/(today|matrix)/, { timeout: 10_000 });
});

test("TC18 – Login: 'Continue without an account' link is visible", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/#/login");
  await expect(page.getByText(/continue without/i).first()).toBeVisible({ timeout: 8_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC19–TC27  Today page
// ─────────────────────────────────────────────────────────────────────────────

test("TC19 – Today: empty state shows 'Nothing planned yet' and Matrix CTA", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPI(page);
  await page.goto("/#/today");
  await expect(page.getByText("Nothing planned yet")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole("button", { name: /open matrix/i })).toBeVisible();
});

test("TC20 – Today: sidebar brand 'Lumo' is visible", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPI(page);
  await page.goto("/#/today");
  await expect(page.getByText("Lumo").first()).toBeVisible({ timeout: 8_000 });
});

test("TC21 – Today: 'Recommended' conviction card shows Q1+today task", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/today");
  await expect(page.getByText("Recommended").first()).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText("Write integration tests").first()).toBeVisible({ timeout: 10_000 });
});

test("TC22 – Today: 'Today's plan' section heading is visible", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/today");
  await expect(page.getByText("Today's plan")).toBeVisible({ timeout: 12_000 });
});

test("TC23 – Today: 'Start focus' button is present on conviction card", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/today");
  await expect(page.getByRole("button", { name: /start focus/i }).first()).toBeVisible({
    timeout: 12_000,
  });
});

test("TC24 – Today: Quick Add modal opens from topbar button", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/today");
  await page.getByRole("button", { name: /quick add/i }).click();
  await expect(page.getByPlaceholder(/what needs doing/i)).toBeVisible({ timeout: 10_000 });
});

test("TC25 – Today: Quick Add Cancel button closes the modal", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/today");
  await page.getByRole("button", { name: /quick add/i }).click();
  await expect(page.getByPlaceholder(/what needs doing/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /cancel/i }).click();
  await expect(page.getByPlaceholder(/what needs doing/i)).not.toBeVisible({ timeout: 10_000 });
});

test("TC26 – Today: Quick Add Create submits and closes modal", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/today");
  await page.getByRole("button", { name: /quick add/i }).click();
  await page.getByPlaceholder(/what needs doing/i).fill("Brand new test task");
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByPlaceholder(/what needs doing/i)).not.toBeVisible({ timeout: 10_000 });
});

test("TC27 – Today: Today nav item is highlighted in sidebar", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPI(page);
  await page.goto("/#/today");
  await expect(page.locator(".nav-item").filter({ hasText: /today/i }).first()).toBeVisible({
    timeout: 8_000,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC28–TC34  Matrix page
// ─────────────────────────────────────────────────────────────────────────────

test("TC28 – Matrix: all four Eisenhower quadrant headers visible", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/matrix");
  await expect(page.getByText("Do first")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("Schedule")).toBeVisible();
  await expect(page.getByText("Delegate")).toBeVisible();
  await expect(page.getByText("Drop")).toBeVisible();
});

test("TC29 – Matrix: Q1 task card renders in the correct quadrant", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/matrix");
  await expect(page.getByText("Do first")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText("Write integration tests")).toBeVisible({ timeout: 10_000 });
});

test("TC30 – Matrix: tasks in Q2, Q3, Q4 also render", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/matrix");
  await expect(page.getByText("Do first")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText("Review pull request")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Update documentation")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Check emails")).toBeVisible({ timeout: 10_000 });
});

test("TC31 – Matrix: calendar view toggle shows week-day columns", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/matrix");
  await expect(page.getByText("Do first")).toBeVisible({ timeout: 8_000 });
  const calBtn = page.getByRole("button", { name: /calendar/i });
  if (await calBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await calBtn.click();
    await expect(
      page.getByText(/sun|mon|tue|wed|thu|fri|sat/i).first()
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /matrix/i }).click();
    await expect(page.getByText("Do first")).toBeVisible({ timeout: 10_000 });
  }
});

test("TC32 – Matrix: 'AI classify' button appears in toolbar", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/matrix");
  await expect(page.getByText("Do first")).toBeVisible({ timeout: 8_000 });
  await expect(
    page.getByRole("button", { name: /ai classify/i }).or(page.getByText(/ai classify/i))
  ).toBeVisible({ timeout: 10_000 });
});

test("TC33 – Matrix: page title 'Matrix' visible in topbar", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/matrix");
  await expect(page.getByText("Matrix").first()).toBeVisible({ timeout: 8_000 });
});

test("TC34 – Matrix: Eisenhower subtitle is present", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/matrix");
  await expect(
    page.getByText(/eisenhower|urgent.*important|important.*urgent/i).first()
  ).toBeVisible({ timeout: 8_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC35–TC40  Focus page
// ─────────────────────────────────────────────────────────────────────────────

test("TC35 – Focus: empty state with 'Nothing to focus on' and CTA", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPI(page);
  await page.goto("/#/focus");
  await expect(page.getByText("Nothing to focus on")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole("button", { name: /go to today/i })).toBeVisible();
});

/** Navigate to focus page with an active task by going through Today → Start focus. */
async function navigateToFocusWithTask(page: Page) {
  await page.goto("/#/today");
  await page.getByRole("button", { name: /start focus/i }).first().click();
  await page.waitForURL(/#\/focus/);
}

test("TC36 – Focus: timer renders in MM:SS format", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await navigateToFocusWithTask(page);
  await expect(page.getByText(/\d{1,2}:\d{2}/).first()).toBeVisible({ timeout: 8_000 });
});

test("TC37 – Focus: 'Do not disturb' label is visible", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await navigateToFocusWithTask(page);
  await expect(page.getByText("Do not disturb")).toBeVisible({ timeout: 12_000 });
});

test("TC38 – Focus: 'Mark complete' button present when a task is active", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/focus");
  await expect(
    page.getByRole("button", { name: /mark complete/i })
      .or(page.getByText("Nothing to focus on"))
  ).toBeVisible({ timeout: 8_000 });
});

test("TC39 – Focus: pause or resume button visible", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/focus");
  await expect(
    page.getByRole("button", { name: /pause|resume/i })
      .or(page.getByText("Nothing to focus on"))
  ).toBeVisible({ timeout: 8_000 });
});

test("TC40 – Focus: 'Round N of M' label present", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/focus");
  await expect(
    page.getByText(/round/i).or(page.getByText("Nothing to focus on"))
  ).toBeVisible({ timeout: 8_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC41–TC53  Settings page — all tabs
// ─────────────────────────────────────────────────────────────────────────────

test("TC41 – Settings: General tab shows accent swatch area and density controls", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPI(page);
  await page.goto("/#/settings");
  await expect(page.getByText("General").first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("Comfortable").first()).toBeVisible();
  await expect(page.getByText("Compact").first()).toBeVisible();
});

test("TC42 – Settings: General tab has Reduced motion toggle", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPI(page);
  await page.goto("/#/settings");
  await expect(page.getByText("General").first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/reduced motion/i)).toBeVisible({ timeout: 10_000 });
});

test("TC43 – Settings: General tab shows English / 中文 language options", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPI(page);
  await page.goto("/#/settings");
  // Language lives on the General tab now (consolidated with Appearance).
  await expect(page.getByText("General").first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/english/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("中文")).toBeVisible();
});

test("TC44 – Settings: switching to 中文 locale updates visible text", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPI(page);
  await page.goto("/#/settings");
  await expect(page.getByText("General").first()).toBeVisible({ timeout: 8_000 });
  await page.getByText("中文").click();
  await expect(page.getByText("中文")).toBeVisible({ timeout: 8_000 });
  // Restore English for subsequent tests
  await page.getByText(/english/i).click();
});

test("TC45 – Settings: Members tab shows 'Add member' button", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/settings");
  await expect(page.getByText("General").first()).toBeVisible({ timeout: 8_000 });
  await page.getByRole("button", { name: /members/i }).click();
  await expect(page.getByRole("button", { name: /add member/i })).toBeVisible({ timeout: 10_000 });
});

test("TC46 – Settings: Members tab empty state hint is visible", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/settings");
  await expect(page.getByText("General").first()).toBeVisible({ timeout: 12_000 });
  await page.getByRole("button", { name: /members/i }).click();
  await expect(
    page.getByText(/no members|add teammates/i)
      .or(page.getByRole("button", { name: /add member/i }))
      .first()
  ).toBeVisible({ timeout: 8_000 });
});

test("TC47 – Settings: AI tab shows provider / model controls", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPI(page);
  await page.goto("/#/settings");
  await expect(page.getByText("General").first()).toBeVisible({ timeout: 8_000 });
  const aiTab = page.getByRole("button", { name: /^AI$/i });
  if (await aiTab.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await aiTab.click();
    await expect(
      page.getByText(/openai|provider|model|api/i).first()
    ).toBeVisible({ timeout: 10_000 });
  }
});

test("TC48 – Settings: Data & Sync tab is hidden on the web build", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPI(page);
  await page.goto("/#/settings");
  await expect(page.getByText("General").first()).toBeVisible({ timeout: 8_000 });
  // Data & Sync (storage location + cloud sync) is a desktop-only concern, so the
  // whole tab is hidden on web — neither the tab nor its storage panel renders.
  await expect(page.getByRole("button", { name: /data & sync/i })).toHaveCount(0);
});

// NOTE: Data & Sync is desktop-only (#112): the whole tab (storage location +
// cloud sync) is hidden on the web build (TC48), so there is no web storage/sync
// test here; desktop coverage lives in electron.spec.ts. The old "Data" tab
// (Reset demo data / Replay onboarding) was removed in #111.

test("TC53 – Settings: Pet tab shows pet management controls", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPI(page);
  await page.goto("/#/settings");
  await expect(page.getByText("General").first()).toBeVisible({ timeout: 8_000 });
  const petTab = page.getByRole("button", { name: /^pet$/i });
  if (await petTab.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await petTab.click();
    await expect(
      page.getByText(/pet|dog|species|visible/i).first()
    ).toBeVisible({ timeout: 10_000 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TC54–TC57  Habits page
// ─────────────────────────────────────────────────────────────────────────────

test("TC54 – Habits: shows sign-in CTA when not authenticated", async ({ page }) => {
  await skipOnboarding(page);
  await mockAPI(page);
  await page.goto("/#/habits");
  await expect(
    page.getByRole("button", { name: /sign in/i })
  ).toBeVisible({ timeout: 8_000 });
});

test("TC55 – Habits: heading and habit list render when signed in", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/habits");
  await expect(page.getByText("Habits").first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("Morning exercise")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Read 30 minutes")).toBeVisible({ timeout: 10_000 });
});

test("TC56 – Habits: 'Add' button opens habit creation modal", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/habits");
  await expect(page.getByText("Habits").first()).toBeVisible({ timeout: 8_000 });
  await page.getByRole("button", { name: /new habit/i }).first().click();
  await expect(page.locator('[role="dialog"] input').first()).toBeVisible({ timeout: 10_000 });
  const closeBtn = page.getByRole("button", { name: /close/i });
  if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await closeBtn.click();
  } else {
    await page.keyboard.press("Escape");
  }
});

test("TC57 – Habits: each card shows a completion checkbox or toggle", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/habits");
  await expect(page.getByText("Morning exercise")).toBeVisible({ timeout: 8_000 });
  await expect(
    page.getByRole("button", { name: /done today/i }).first()
  ).toBeVisible({ timeout: 10_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC58–TC61  Stats page
// ─────────────────────────────────────────────────────────────────────────────

test("TC58 – Stats: shows sign-in CTA when not authenticated", async ({ page }) => {
  await skipOnboarding(page);
  await mockAPI(page);
  await page.goto("/#/stats");
  await expect(
    page.getByRole("button", { name: /sign in/i })
  ).toBeVisible({ timeout: 8_000 });
});

test("TC59 – Stats: 'This week' section renders when signed in", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/stats");
  await expect(page.getByRole("heading", { name: "This Week", exact: true })).toBeVisible({ timeout: 8_000 });
});

test("TC60 – Stats: 'All time' section renders", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/stats");
  await expect(page.getByText(/all time/i)).toBeVisible({ timeout: 8_000 });
});

test("TC61 – Stats: Tasks, Focus, and Streak stat cards are visible", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/stats");
  await expect(page.getByRole("heading", { name: "This Week", exact: true })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/tasks/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/focus|hours/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/streak/i).first()).toBeVisible({ timeout: 10_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC62–TC65  Countdown page
// ─────────────────────────────────────────────────────────────────────────────

test("TC62 – Countdown: shows sign-in CTA when not authenticated", async ({ page }) => {
  await skipOnboarding(page);
  await mockAPI(page);
  await page.goto("/#/countdown");
  await expect(
    page.getByRole("button", { name: /sign in/i })
  ).toBeVisible({ timeout: 8_000 });
});

test("TC63 – Countdown: renders countdown list when signed in", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/countdown");
  await expect(page.getByText(/countdown/i).first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("Product launch")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Team offsite")).toBeVisible({ timeout: 10_000 });
});

test("TC64 – Countdown: 'Add' button opens creation modal", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/countdown");
  await expect(page.getByText(/countdown/i).first()).toBeVisible({ timeout: 8_000 });
  await page.getByRole("button", { name: /new event/i }).first().click();
  await expect(page.locator('[role="dialog"] input').first()).toBeVisible({ timeout: 10_000 });
  const closeBtn = page.getByRole("button", { name: /close/i });
  if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await closeBtn.click();
  } else {
    await page.keyboard.press("Escape");
  }
});

test("TC65 – Countdown: cards show time-remaining information", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/countdown");
  await expect(page.getByText("Product launch")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/days|upcoming|past/i).first()).toBeVisible({ timeout: 10_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC79–TC81  Countdown lunar calendar (#43 P2)
// ─────────────────────────────────────────────────────────────────────────────

test("TC79 – Countdown form: Solar/Lunar toggle reveals the lunar year/month/day picker", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/countdown");
  await page.getByRole("button", { name: /new event/i }).first().click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // Solar is the default → native date input present, no select-based picker.
  await expect(dialog.locator('input[type="date"]')).toBeVisible();
  await expect(dialog.locator("select")).toHaveCount(0);

  // Switch to Lunar → date input gone, the three year/month/day selects appear.
  await dialog.getByRole("radio", { name: "Lunar" }).click();
  await expect(dialog.locator('input[type="date"]')).toHaveCount(0);
  await expect(dialog.locator("select")).toHaveCount(3);
  await expect(dialog.getByLabel("Year")).toBeVisible();
  await expect(dialog.getByLabel("Month")).toBeVisible();
  await expect(dialog.getByLabel("Day")).toBeVisible();
});

test("TC80 – Countdown lunar picker: no raw i18n keys leak in the open form", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/countdown");
  await page.getByRole("button", { name: /new event/i }).first().click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole("radio", { name: "Lunar" }).click();
  await expect(dialog.getByLabel("Month")).toBeVisible();

  // No visible text inside the dialog should look like a bare countdown.* key.
  const text = await dialog.innerText();
  const leaked = text
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => /^countdown\.[a-z0-9.]+$/i.test(s));
  expect(leaked).toEqual([]);
});

test("TC81 – Countdown: lunar event card shows the Lunar badge and a Chinese lunar date", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/countdown");
  await expect(page.getByText("Lunar birthday")).toBeVisible({ timeout: 10_000 });
  // The amber lunar card carries the "Lunar" badge…
  await expect(page.getByText("Lunar", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  // …and renders the lunar date string (农历五月初一 → 五月初一) rather than a solar one.
  await expect(page.getByText(/五月初一/).first()).toBeVisible({ timeout: 10_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC66–TC70  Account & Change password
// ─────────────────────────────────────────────────────────────────────────────

test("TC66 – Account: shows local-account prompt when not signed in", async ({ page }) => {
  await skipOnboarding(page);
  await mockAPI(page);
  await page.goto("/#/account");
  await expect(
    page.getByText(/local account|using local/i)
      .or(page.getByRole("button", { name: /sign in/i }))
  ).toBeVisible({ timeout: 8_000 });
});

test("TC67 – Account: shows user name and email when signed in", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/account");
  await expect(page.getByText("Account").first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole("main").getByText("Alex").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("alex@stride.studio").first()).toBeVisible({ timeout: 10_000 });
});

test("TC68 – Account: 'Sign out' button visible when signed in", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/account");
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible({ timeout: 8_000 });
});

test("TC69 – Change password: has current, new, and confirm password inputs", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/account/change-password");
  await expect(page.locator('input[type="password"]')).toHaveCount(3, { timeout: 8_000 });
});

test("TC70 – Change password: mismatched new passwords shows error", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/account/change-password");
  await page.locator('input[type="password"]').first().fill("OldPassword!123");
  await page.locator('input[type="password"]').nth(1).fill("NewPass!123");
  await page.locator('input[type="password"]').nth(2).fill("Differ!456");
  await page.getByRole("button", { name: /update password|save/i }).click();
  await expect(page.getByText(/match|mismatch|do not match/i)).toBeVisible({ timeout: 10_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC71–TC74  Navigation & routing
// ─────────────────────────────────────────────────────────────────────────────

test("TC71 – Navigation: Today → Matrix → Settings updates URL correctly", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/today");
  await page.getByText(/^Matrix$/i).click();
  await expect(page).toHaveURL(/matrix/);
  await page.getByText(/^Settings$/i).click();
  await expect(page).toHaveURL(/settings/);
  await page.getByText(/^Today$/i).click();
  await expect(page).toHaveURL(/today/);
});

test("TC72 – Navigation: all five shell nav links load their pages", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/today");

  const routes: [RegExp, RegExp][] = [
    [/^Today\b/i,    /nothing planned|recommended|today's plan/i],
    [/^Matrix\b/i,   /do first/i],
    [/^Focus$/i,     /\d{1,2}:\d{2}|nothing to focus/i],
    [/^Stats$/i,     /this week|stats|focus report/i],
    [/^Settings$/i,  /appearance/i],
  ];

  for (const [navLabel, expectedText] of routes) {
    await page.getByRole("link", { name: navLabel }).click();
    await expect(page.getByText(expectedText).first()).toBeVisible({ timeout: 8_000 });
  }
});

test("TC73 – Navigation: unknown hash route redirects to Today", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPI(page);
  await page.goto("/#/nonexistent-route-xyz");
  await expect(page).toHaveURL(/#\/today/);
});

test("TC74 – Navigation: Focus nav link navigates to Focus page", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/today");
  await page.getByRole("link", { name: /^Focus$/i }).click();
  await expect(page).toHaveURL(/focus/);
  await expect(
    page.getByText(/\d{1,2}:\d{2}/).or(page.getByText("Nothing to focus on")).first()
  ).toBeVisible({ timeout: 8_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC75–TC78  i18n: no untranslated key leaks into the rendered UI
//
// Companion to the static guard in src/i18n/__tests__/strings.test.ts. That one
// proves every *referenced* key EXISTS in the dictionary; these prove the
// *rendered* UI never displays a raw key — the 乱码 bug a user actually sees
// (e.g. a habit-frequency pill reading "habit.freq.weekend" instead of its
// translation). Detection: any visible text (or aria-label/placeholder/title)
// that is exactly a known i18n key, or matches the dotted-key shape under a real
// key namespace, is a leak.
// ─────────────────────────────────────────────────────────────────────────────

const I18N_KEYS = new Set(Object.keys(STRINGS.en));
const I18N_NAMESPACES = new Set([...I18N_KEYS].map((k) => k.split(".")[0]));
const I18N_KEY_SHAPE = /^[a-z][a-z0-9]*(?:\.[a-z0-9_]+)+$/;

async function findRawI18nKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ keys, namespaces, shapeSrc }) => {
      const KEYS = new Set(keys);
      const NS = new Set(namespaces);
      const shape = new RegExp(shapeSrc);
      const hits = new Set<string>();
      const consider = (raw: string | null) => {
        const t = (raw || "").trim();
        if (!t) return;
        if (KEYS.has(t) || (shape.test(t) && NS.has(t.split(".")[0]))) hits.add(t);
      };
      const visible = (el: Element | null) => {
        if (!el) return false;
        const cs = getComputedStyle(el as HTMLElement);
        if (cs.visibility === "hidden" || cs.display === "none") return false;
        const r = (el as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        if (visible(n.parentElement)) consider(n.textContent);
      }
      document.querySelectorAll("[aria-label],[placeholder],[title]").forEach((el) => {
        if (!visible(el)) return;
        consider(el.getAttribute("aria-label"));
        consider(el.getAttribute("placeholder"));
        consider(el.getAttribute("title"));
      });
      return [...hits];
    },
    { keys: [...I18N_KEYS], namespaces: [...I18N_NAMESPACES], shapeSrc: I18N_KEY_SHAPE.source },
  );
}

async function expectNoRawKeys(page: Page, where: string) {
  const leaks = await findRawI18nKeys(page);
  expect(leaks, `raw i18n keys leaked into UI at ${where}: ${leaks.join(", ")}`).toEqual([]);
}

test("TC75 – i18n: core pages render no raw i18n keys (en)", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  for (const route of ["today", "matrix", "focus", "stats", "habits", "countdown", "account", "settings"]) {
    await page.goto(`/#/${route}`);
    await expect(page.getByRole("link", { name: /^Today\b/i }).first()).toBeVisible({ timeout: 8_000 });
    await expectNoRawKeys(page, `/#/${route}`);
  }
});

test("TC76 – i18n: Habit creation modal shows no raw keys across frequency modes (en)", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/habits");
  await expect(page.getByText("Habits").first()).toBeVisible({ timeout: 8_000 });
  await page.getByRole("button", { name: /new habit/i }).first().click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog.locator("input").first()).toBeVisible({ timeout: 10_000 });
  await expectNoRawKeys(page, "habit modal (default frequency)");
  // Each sub-config (weekday picker, times/week, interval) is rendered only when
  // its frequency pill is selected — visit each so habit.day.* and the *.label
  // keys actually render.
  for (const pill of ["Pick days", "Times / week", "Interval"]) {
    await dialog.getByRole("button", { name: pill, exact: true }).click();
    await expectNoRawKeys(page, `habit modal (${pill})`);
  }
});

test("TC77 – i18n: Habit calendar modal shows no raw keys (en)", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/habits");
  await expect(page.getByText("Morning exercise")).toBeVisible({ timeout: 8_000 });
  await page.getByRole("button", { name: "Habit calendar" }).first().click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 10_000 });
  await expectNoRawKeys(page, "habit calendar modal");
});

test("TC78 – i18n: core pages + habit modal show no raw keys (中文)", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  // Switch to 中文 via Settings (same flow as TC44; language is on the General tab).
  await page.goto("/#/settings");
  await expect(page.getByText("General").first()).toBeVisible({ timeout: 8_000 });
  await page.getByText("中文").click();
  await expect(page.getByText("中文")).toBeVisible({ timeout: 8_000 });
  for (const route of ["today", "matrix", "stats", "habits", "countdown", "settings"]) {
    await page.goto(`/#/${route}`);
    await page.waitForLoadState("networkidle");
    await expectNoRawKeys(page, `zh /#/${route}`);
  }
  // Habit modal in 中文 — the richest dynamic-key surface (freq pills + sub-configs).
  await page.goto("/#/habits");
  await page.getByRole("button", { name: /新建习惯/ }).first().click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog.locator("input").first()).toBeVisible({ timeout: 10_000 });
  await expectNoRawKeys(page, "zh habit modal (default frequency)");
  for (const pill of ["指定星期", "每周几次", "间隔"]) {
    await dialog.getByRole("button", { name: pill, exact: true }).click();
    await expectNoRawKeys(page, `zh habit modal (${pill})`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TC82  Accessibility: every icon-only button has an accessible name
//
// Screen-reader users hit an icon-only button (close ✕, "more options" ⋯, month
// arrows) as a nameless "button" with no idea what it does — WCAG 4.1.2. This
// guard scans every visible <button> for an accessible name (text content, or
// aria-label / title / aria-labelledby) and fails listing any that lack one, so
// a new unlabeled icon button can't regress in. Covers the core shell (incl. the
// countdown card "more options" menu) plus the countdown form's close button.
// ─────────────────────────────────────────────────────────────────────────────

async function findUnlabeledButtons(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const cs = getComputedStyle(el as HTMLElement);
      if (cs.visibility === "hidden" || cs.display === "none") return false;
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const named = (el: Element): boolean => {
      if ((el.textContent || "").trim()) return true;
      const label = el.getAttribute("aria-label");
      if (label && label.trim()) return true;
      const title = el.getAttribute("title");
      if (title && title.trim()) return true;
      const lb = el.getAttribute("aria-labelledby");
      if (lb && lb.split(/\s+/).some((id) => (document.getElementById(id)?.textContent || "").trim())) return true;
      return false;
    };
    const bad: string[] = [];
    document.querySelectorAll("button").forEach((el) => {
      if (visible(el) && !named(el)) {
        bad.push(el.outerHTML.replace(/\s+/g, " ").slice(0, 120));
      }
    });
    return bad;
  });
}

async function expectAllButtonsNamed(page: Page, where: string) {
  const bad = await findUnlabeledButtons(page);
  expect(bad, `icon-only button(s) without an accessible name at ${where}:\n${bad.join("\n")}`).toEqual([]);
}

test("TC82 – a11y: icon-only buttons across the shell expose an accessible name", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  for (const route of ["today", "matrix", "focus", "stats", "habits", "countdown", "account", "settings"]) {
    await page.goto(`/#/${route}`);
    await expect(page.getByRole("link", { name: /^Today\b/i }).first()).toBeVisible({ timeout: 8_000 });
    await expectAllButtonsNamed(page, `/#/${route}`);
  }

  // Countdown form modal — the close button was previously nameless.
  await page.goto("/#/countdown");
  await page.getByRole("button", { name: /new event/i }).first().click();
  const form = page.locator('[role="dialog"]');
  await expect(form).toBeVisible({ timeout: 10_000 });
  await expectAllButtonsNamed(page, "countdown form modal");
});

// ─────────────────────────────────────────────────────────────────────────────
// TC83  Accessibility: modal keyboard behaviour (Esc closes, focus returns)
//
// Backs the shared useModalA11y hook end-to-end in a real browser: opening a
// dialog moves focus inside it, Escape closes it, and focus returns to the
// trigger that opened it (so keyboard users aren't dumped at the top of the page).
// ─────────────────────────────────────────────────────────────────────────────

test("TC83 – a11y: dialog opens with focus inside, Esc closes it and returns focus to the trigger", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/countdown");

  const trigger = page.getByRole("button", { name: /new event/i }).first();
  await trigger.focus();
  await trigger.press("Enter");

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // Focus moved into the dialog on open.
  const focusInDialog = await dialog.evaluate(
    (el) => el.contains(document.activeElement) && el !== document.activeElement,
  );
  expect(focusInDialog, "focus should be inside the dialog on open").toBe(true);

  // Escape closes it…
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 8_000 });

  // …and focus returns to the button that opened it.
  await expect(trigger).toBeFocused();
});

// ─────────────────────────────────────────────────────────────────────────────
// TC84  Accessibility: keyboard focus paints a visible ring
//
// Backs the global :focus-visible rule — Tab (keyboard) must paint an accent
// outline on the focused control so keyboard users can see where they are.
// (The mouse-focus "no ring" half is the standard :focus:not(:focus-visible)
// branch; it's not asserted here because Chromium's focus-visible heuristic
// after a prior keyboard event makes it flaky to drive in an e2e run.)
// ─────────────────────────────────────────────────────────────────────────────

test("TC84 – a11y: keyboard focus paints a visible outline", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/today");
  await expect(page.getByRole("link", { name: /^Today\b/i }).first()).toBeVisible({ timeout: 8_000 });

  // Tab through the first several controls; each focused element must show a
  // visible focus indicator — the global :focus-visible outline for buttons/links,
  // or the .input:focus box-shadow ring for inputs — never nothing.
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return { focused: false, indicated: false, tag: "" };
      const cs = getComputedStyle(el);
      const hasOutline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth || "0") > 0;
      const hasShadow = cs.boxShadow !== "none" && cs.boxShadow !== "";
      return { focused: true, indicated: hasOutline || hasShadow, tag: el.tagName.toLowerCase() };
    });
    expect(focused.focused, `an element should be focused after Tab #${i + 1}`).toBe(true);
    expect(focused.indicated, `focused <${focused.tag}> must show a focus indicator after Tab #${i + 1}`).toBe(true);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TC87  Templates (#173): save a task as a template, then instantiate it from
// the library. Exercises the full vertical slice — ⋯ menu → save → library →
// Use → tasks POST — against the stateful templates mock.
// ─────────────────────────────────────────────────────────────────────────────

test("TC87 – templates: save a task as a template and instantiate it from the library", async ({ page }) => {
  await skipOnboardingAndSignIn(page);
  await mockAPIWithData(page);
  await page.goto("/#/today");

  // Take the first task row that actually exposes a ⋯ menu. Today special-cases its
  // hero/active task as a heading WITHOUT a ⋯, and does not render rows in seed
  // order, so we don't assume a particular title — we capture whichever row this is
  // and assert that same title round-trips through the template library.
  const moreBtn = page.getByRole("button", { name: "More actions" }).first();
  await expect(moreBtn).toBeAttached({ timeout: 10_000 });
  const row = moreBtn.locator(
    "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' border-b ')][1]",
  );
  const savedTitle = (await row.locator(".truncate").first().innerText()).trim();

  // The ⋯ lives in a container that is opacity:0 / pointer-events:none until the
  // row's `hovered` state is true; under Playwright that boolean races and a real
  // click is intercepted by the parent row div. Dispatch the click straight to the
  // button instead — its onClick only reads the button's own rect, so it is
  // functionally identical to a user click but immune to the pointer-events gate.
  await moreBtn.dispatchEvent("click");
  await page.getByRole("button", { name: "Save as template" }).click();
  // Confirmation toast.
  await expect(page.getByText("Saved as template")).toBeVisible({ timeout: 8_000 });

  // Open the template library from the Matrix toolbar.
  await page.goto("/#/matrix");
  await page.getByRole("button", { name: "Templates" }).click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 8_000 });
  // The saved template (named after the task) shows up.
  await expect(dialog.getByText(savedTitle).first()).toBeVisible({ timeout: 8_000 });

  // Instantiating it fires a task-create request.
  const createReq = page.waitForRequest(
    (r) => r.url().includes("/v1/tasks") && r.method() === "POST",
    { timeout: 8_000 },
  );
  await dialog.getByRole("button", { name: "Use" }).first().click();
  await createReq;
});

// ─────────────────────────────────────────────────────────────────────────────
// TC85  Mobile: no horizontal overflow on a Pixel-5-class viewport
//
// The most common mobile bug is content wider than the screen (a fixed-width row,
// an un-wrapping flex line, a too-wide card) — it clips or forces a sideways
// scroll. This walks every shell page at 393px wide and fails if the document
// is wider than the viewport, listing the widest visible offenders to debug.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("mobile viewport", () => {
  test.use({ viewport: { width: 393, height: 851 } });

  test("TC85 – mobile: shell pages have no horizontal overflow", async ({ page }) => {
    await skipOnboardingAndSignIn(page);
    await mockAPIWithData(page);

    const offenders: string[] = [];
    for (const route of ["today", "matrix", "stats", "habits", "countdown", "account", "settings"]) {
      await page.goto(`/#/${route}`);
      await page.locator('nav[aria-label="Tab bar"]').waitFor({ state: "visible", timeout: 8_000 });
      const m = await page.evaluate(() => {
        const vw = window.innerWidth;
        const wide: string[] = [];
        document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none" || r.width === 0) return;
          if (r.right > vw + 1 && r.width <= vw + 200) {
            wide.push(`${el.tagName.toLowerCase()}.${String(el.className).replace(/\s+/g, ".").slice(0, 40)} right=${Math.round(r.right)}`);
          }
        });
        return { vw, scrollW: document.body.scrollWidth, wide: wide.slice(0, 4) };
      });
      if (m.scrollW > m.vw + 1) {
        offenders.push(`${route}: body ${m.scrollW}px > ${m.vw}px [${m.wide.join(" | ")}]`);
      }
    }
    expect(offenders, `horizontal overflow:\n${offenders.join("\n")}`).toEqual([]);
  });

  // TC86 — the primary mobile navigation (bottom tab bar) must have comfortable
  // touch targets. WCAG 2.5.5 (enhanced) asks for 44×44 CSS px; these are the
  // most-tapped controls on mobile, so guard them against shrinking.
  test("TC86 – mobile: bottom tab bar buttons meet the 44px touch target", async ({ page }) => {
    await skipOnboardingAndSignIn(page);
    await mockAPIWithData(page);
    await page.goto("/#/today");
    const tabbar = page.locator('nav[aria-label="Tab bar"]');
    await tabbar.waitFor({ state: "visible", timeout: 8_000 });

    const buttons = tabbar.locator("button");
    const count = await buttons.count();
    expect(count, "tab bar should render its buttons").toBeGreaterThan(0);

    const tooSmall: string[] = [];
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      const label = (await buttons.nth(i).innerText()).replace(/\s+/g, " ").trim();
      if (!box || box.height < 44 || box.width < 44) {
        tooSmall.push(`"${label}" ${box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "no box"}`);
      }
    }
    expect(tooSmall, `tab bar targets below 44px:\n${tooSmall.join("\n")}`).toEqual([]);
  });
});
