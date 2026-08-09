/**
 * Real-backend integration tests.
 *
 * Runs against live Hono backend (port 47292) + Vite dev (port 5174).
 * No API mocking — every request hits the real backend.
 */

import { test, expect, type Page } from "@playwright/test";
import { nanoid, customAlphabet } from "nanoid";

const BACKEND = "http://localhost:47292";

// Auth is username-first (commit 1945fba): registration/sign-in take
// { username, password }. Usernames are [A-Za-z0-9_-], 3–32 chars — generate a
// safe, collision-free one from a lowercase-alphanumeric alphabet.
const uid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);
function uniqueUsername(prefix: string): string {
  return `${prefix}${uid()}`;
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function registerUser(username: string, password: string) {
  const res = await fetch(`${BACKEND}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`Register failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ token: string; user: object }>;
}

/** Set onboarded=true so the auth gate redirects to /login not /onboarding. */
async function setOnboarded(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "lumo.app.v1",
      JSON.stringify({
        state: { locale: "en", accent: "green", density: "comfortable", reducedMotion: false, onboarded: true },
        version: 0,
      })
    );
  });
}

/** Inject a valid JWT so the page boots already signed in. */
async function loginAs(page: Page, token: string, user: object) {
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem(
        "lumo.app.v1",
        JSON.stringify({
          state: { locale: "en", accent: "green", density: "comfortable", reducedMotion: false, onboarded: true },
          version: 0,
        })
      );
      localStorage.setItem(
        "lumo.auth.v1",
        JSON.stringify({ state: { user, token }, version: 0 })
      );
      // API client reads token from this flat key (see src/api/client.ts TOKEN_KEY)
      localStorage.setItem("lumo.token", token);
    },
    { token, user }
  );
}

// ── 1. Auth flow ──────────────────────────────────────────────────────────────

test.describe("Auth — real API", () => {
  test("register via UI → recovery-code gate → redirects to app", async ({ page }) => {
    await setOnboarded(page);
    const username = uniqueUsername("uiuser");
    await page.goto("/#/register");

    // Username-first form: fill the username input + password + confirm.
    await page.locator('input[autocomplete="username"]').fill(username);
    await page.locator('input[type="password"]').first().fill("Integration!23");
    await page.locator('input[type="password"]').nth(1).fill("Integration!23"); // confirm
    await page.getByRole("button", { name: /create account/i }).click();

    // Post-register: the one-time recovery-code gate is shown before routing on.
    await expect(page.getByTestId("recovery-code")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "I've saved my recovery code" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL(/#\/today/, { timeout: 15_000 });
  });

  test("wrong password shows error", async ({ page }) => {
    await setOnboarded(page);
    await page.goto("/#/login");
    await page.locator('input[autocomplete="username"]').fill("nobody");
    await page.locator('input[type="password"]').fill("WrongPassword!1");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    // Toast stack uses aria-live="assertive"; error toasts persist for 6 s
    await expect(
      page.locator('[aria-live="assertive"]')
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ── 2. Task CRUD — real API ───────────────────────────────────────────────────

test.describe("Tasks — real API", () => {
  let token: string;
  let user: object;

  test.beforeAll(async () => {
    const data = await registerUser(uniqueUsername("tasks"), "Integration!23");
    token = data.token;
    user = data.user;
  });

  test("task created via API appears in Today list", async ({ page }) => {
    await loginAs(page, token, user);

    const title = `Integration task ${nanoid(4)}`;
    const res = await fetch(`${BACKEND}/v1/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: { en: title }, quadrant: "Q1", today: true }),
    });
    if (!res.ok) throw new Error(`Task create failed: ${res.status} ${await res.text()}`);

    await page.goto("/#/today");
    await expect(page.getByText(title)).toBeVisible({ timeout: 8_000 });
  });

  test("complete task disappears from active list", async ({ page }) => {
    await loginAs(page, token, user);

    const title = `Complete me ${nanoid(4)}`;
    const res = await fetch(`${BACKEND}/v1/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: { en: title }, quadrant: "Q1", today: true }),
    });
    if (!res.ok) throw new Error(`Task create failed: ${res.status} ${await res.text()}`);

    await page.goto("/#/today");
    const row = page.getByText(title);
    await expect(row).toBeVisible({ timeout: 8_000 });
    // The complete button is a sibling circle in the task row
    await page.getByRole("button", { name: "Complete task" }).first().click();
    // After completing, the "Complete task" button should no longer be present for this task
    await expect(page.getByRole("button", { name: "Complete task" })).not.toBeVisible({ timeout: 5_000 });
  });

  test("task deleted via API absent on reload", async ({ page }) => {
    await loginAs(page, token, user);

    const title = `Delete me ${nanoid(4)}`;
    const createRes = await fetch(`${BACKEND}/v1/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: { en: title }, quadrant: "Q2" }),
    });
    if (!createRes.ok) throw new Error(`Task create failed: ${createRes.status}`);
    const task = await createRes.json();

    const delRes = await fetch(`${BACKEND}/v1/tasks/${task.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!delRes.ok) throw new Error(`Task delete failed: ${delRes.status}`);

    await page.goto("/#/matrix");
    await expect(page.getByText(title)).not.toBeVisible();
  });
});

// ── 3. Settings — real API ────────────────────────────────────────────────────

test.describe("Settings — real API", () => {
  let token: string;
  let user: object;

  test.beforeAll(async () => {
    const data = await registerUser(uniqueUsername("settings"), "Integration!23");
    token = data.token;
    user = data.user;
  });

  test("settings page loads without error", async ({ page }) => {
    await loginAs(page, token, user);
    await page.goto("/#/settings");
    // Settings opens on the "General" tab, whose panel renders a "General" heading.
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible({ timeout: 8_000 });
  });
});

// ── 4. Focus — real API ───────────────────────────────────────────────────────

test.describe("Focus — real API", () => {
  let token: string;
  let user: object;

  test.beforeAll(async () => {
    const data = await registerUser(uniqueUsername("focus"), "Integration!23");
    token = data.token;
    user = data.user;
  });

  test("focus page renders timer", async ({ page }) => {
    await loginAs(page, token, user);
    await page.goto("/#/focus");
    await expect(page.getByText(/\d{1,2}:\d{2}/).first()).toBeVisible({ timeout: 8_000 });
  });
});

// ── 5. Health sanity ──────────────────────────────────────────────────────────

test("backend /health is reachable", async ({ request }) => {
  const res = await request.get(`${BACKEND}/health`);
  expect(res.ok()).toBe(true);
});
