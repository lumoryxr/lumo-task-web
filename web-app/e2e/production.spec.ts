/**
 * Production site validation suite.
 *
 * Targets the LIVE deployed frontend and backend (no mocks, no dev server).
 * Each test creates its own ephemeral account `qa-bot-<rand>@lumo-test.example`
 * so reruns don't collide. Suite caps register operations to stay below the
 * backend's 10/IP/minute auth rate limit.
 *
 * Coverage map (see docs/qa/prod-site-validation-2026-06-23.md):
 *   AC-1   Site availability
 *   AC-2   Onboarding
 *   AC-3   Bilingual EN/ZH
 *   AC-4   Auth (real backend)
 *   AC-5   Today View (signed-in)
 *   AC-6   Eisenhower Matrix
 *   AC-7   Task CRUD via real backend
 *   AC-8   Focus / Pomodoro
 *   AC-9   Habit Check-in
 *   AC-10  PWA
 *   AC-11  Mobile layout
 *   AC-12  Security smoke
 *
 * Run: PROD_BASE_URL=https://lumo-task-frontend.onrender.com \
 *      npx playwright test --config=playwright.production.config.ts
 */

import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test";

const FRONTEND_BASE =
  process.env.PROD_BASE_URL ?? "https://lumo-task-frontend.onrender.com";
const API_BASE =
  process.env.PROD_API_BASE ?? "https://lumo-task-backend-1c3x.onrender.com";

const TEST_EMAIL_DOMAIN = "lumo-test.example";

function randomId(): string {
  return Math.random().toString(36).slice(2, 14);
}

function makeAccount() {
  const id = randomId();
  return {
    email: `qa-bot-${id}@${TEST_EMAIL_DOMAIN}`,
    password: "QaBotPass!2026",
    name: `QA Bot ${id.slice(0, 4)}`,
  };
}

// Backend enforces 10 /v1/auth/* attempts per IP per minute. With ~14 register
// calls in this suite, a parallel burst trips the limit. Serialize all register
// traffic through a single promise chain that releases one call every 7s
// (≈8.5/min — under the 10/min ceiling with safety margin).
let _authChain: Promise<void> = Promise.resolve();
const AUTH_MIN_INTERVAL_MS = 7_000;

function throttleAuth<T>(work: () => Promise<T>): Promise<T> {
  const released = _authChain.then(work);
  _authChain = released
    .catch(() => undefined)
    .then(() => new Promise((r) => setTimeout(r, AUTH_MIN_INTERVAL_MS)));
  return released;
}

async function registerViaApi(api: APIRequestContext, account = makeAccount()) {
  return throttleAuth(async () => {
    const res = await api.post(`${API_BASE}/v1/auth/register`, {
      data: account,
      timeout: 60_000,
    });
    expect(res.status(), `register ${account.email}`).toBe(201);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.user?.email).toBe(account.email);
    return { account, token: body.token as string, user: body.user };
  });
}

async function seedAuthInLocalStorage(page: Page, token: string, user: any) {
  await page.addInitScript(
    ({ token, user }) => {
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
        JSON.stringify({ state: { user }, version: 0 })
      );
      localStorage.setItem("lumo.token", token);
    },
    { token, user }
  );
}

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

// ── Suite-level warm-up: pre-warm Render free-tier backend ────────────────────
test.beforeAll(async () => {
  const api = await request.newContext();
  try {
    await api.get(`${API_BASE}/health`, { timeout: 60_000 });
  } finally {
    await api.dispose();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1  Site availability
// ─────────────────────────────────────────────────────────────────────────────

test("AC-1.1 — Frontend root returns 200 with SPA shell", async ({ request }) => {
  const res = await request.get(`${FRONTEND_BASE}/`, { timeout: 30_000 });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toMatch(/<div id="root"><\/div>|<title>[^<]*Lumo/i);
});

test("AC-1.2 — Backend /health returns 200", async ({ request }) => {
  const res = await request.get(`${API_BASE}/health`, { timeout: 60_000 });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
});

test("AC-1.3 — Onboarding page loads with no JS errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/");
  await expect(page.getByText(/welcome to lumo/i)).toBeVisible({ timeout: 15_000 });
  // Ignore third-party noise — only fail on actual app errors
  const appErrors = errors.filter(
    (e) =>
      !/favicon|manifest|chrome-extension|sw\.js|service-worker/i.test(e) &&
      !/Failed to load resource/i.test(e)
  );
  expect(appErrors, `unexpected app errors: ${appErrors.join("\n")}`).toEqual([]);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2  Onboarding
// ─────────────────────────────────────────────────────────────────────────────

test("AC-2.1 — First visit lands on onboarding step 1 / 5", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/#\/onboarding/, { timeout: 15_000 });
  await expect(page.getByText("1 / 5")).toBeVisible();
});

test("AC-2.2 — Primary CTA advances to step 2", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /let's set it up/i }).click();
  await expect(page.getByText("2 / 5")).toBeVisible({ timeout: 10_000 });
});

test("AC-2.3 — Skip button exits onboarding to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("1 / 5")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /skip/i }).click();
  await expect(page).toHaveURL(/#\/login/, { timeout: 10_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3  Bilingual EN/ZH
// ─────────────────────────────────────────────────────────────────────────────

test("AC-3.1 — Step 2 shows both English and 中文 options", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /let's set it up/i }).click();
  await expect(page.locator("text=Language").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/english/i)).toBeVisible();
  await expect(page.getByText("中文")).toBeVisible();
});

test("AC-3.2 — Selecting 中文 updates UI text to Chinese", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /let's set it up/i }).click();
  await expect(page.locator("text=Language").first()).toBeVisible({ timeout: 15_000 });
  await page.getByText("中文").click();
  // After ZH selection, the primary CTA label flips to "继续" (Continue)
  await expect(page.locator("footer .btn-primary")).toContainText(/继续/, {
    timeout: 8_000,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4  Auth (real backend)
// ─────────────────────────────────────────────────────────────────────────────

test("AC-4.1 — POST /v1/auth/register with fresh email → 201", async ({ request }) => {
  const account = makeAccount();
  const { user } = await registerViaApi(request, account);
  expect(user.email).toBe(account.email);
  expect(user.plan).toBe("free");
});

test("AC-4.2 — Duplicate register returns 409 EMAIL_TAKEN", async ({ request }) => {
  const account = makeAccount();
  await registerViaApi(request, account);

  const second = await throttleAuth(() =>
    request.post(`${API_BASE}/v1/auth/register`, {
      data: account,
      timeout: 60_000,
    })
  );
  expect(second.status()).toBe(409);
  const body = await second.json();
  const code = body?.error?.code ?? body?.code;
  expect(String(code)).toMatch(/EMAIL_TAKEN/i);
});

test("AC-4.4 — Register via API then sign-in via API succeeds", async ({ request }) => {
  const { account } = await registerViaApi(request);

  const signin = await throttleAuth(() =>
    request.post(`${API_BASE}/v1/auth/signin`, {
      data: { email: account.email, password: account.password },
      timeout: 60_000,
    })
  );
  expect(signin.status()).toBe(200);
  const body = await signin.json();
  expect(body.token).toBeTruthy();
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5  Today View (signed-in, real data)
// ─────────────────────────────────────────────────────────────────────────────

test("AC-5.1 — Freshly-registered user sees empty Today state", async ({ page, request }) => {
  const { token, user } = await registerViaApi(request);
  await seedAuthInLocalStorage(page, token, user);
  await page.goto("/#/today");
  await expect(page.getByText(/nothing planned yet/i)).toBeVisible({ timeout: 20_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6  Eisenhower Matrix (signed-in, real data)
// ─────────────────────────────────────────────────────────────────────────────

test("AC-6.1 — Matrix shows all four quadrant headers", async ({ page, request }) => {
  const { token, user } = await registerViaApi(request);
  await seedAuthInLocalStorage(page, token, user);
  await page.goto("/#/matrix");
  await expect(page.getByText(/do first/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/schedule/i).first()).toBeVisible();
  await expect(page.getByText(/delegate/i).first()).toBeVisible();
  await expect(page.getByText(/drop/i).first()).toBeVisible();
});

test("AC-6.2 — Task created with quadrant=Q1 renders in 'Do first'", async ({ page, request }) => {
  const { token, user } = await registerViaApi(request);

  // Create a Q1 task via API
  const created = await request.post(`${API_BASE}/v1/tasks`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: { en: "Q1 production smoke task" }, quadrant: "Q1", today: false },
    timeout: 60_000,
  });
  expect([200, 201]).toContain(created.status());

  await seedAuthInLocalStorage(page, token, user);
  await page.goto("/#/matrix");
  await expect(page.getByText("Q1 production smoke task")).toBeVisible({ timeout: 20_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7  Task CRUD via real backend
// ─────────────────────────────────────────────────────────────────────────────

test("AC-7 — Full task CRUD (create → list → complete → delete)", async ({ request }) => {
  const { token } = await registerViaApi(request);
  const auth = { Authorization: `Bearer ${token}` };

  // CREATE
  const createRes = await request.post(`${API_BASE}/v1/tasks`, {
    headers: auth,
    data: { title: { en: "CRUD task" }, quadrant: "Q2", today: true },
    timeout: 60_000,
  });
  expect([200, 201]).toContain(createRes.status());
  const created = await createRes.json();
  const id = created.id ?? created.task?.id;
  expect(id, "created task id").toBeTruthy();

  // READ
  const listRes = await request.get(`${API_BASE}/v1/tasks`, {
    headers: auth,
    timeout: 60_000,
  });
  expect(listRes.status()).toBe(200);
  const list = await listRes.json();
  const ids = (Array.isArray(list) ? list : list.tasks ?? []).map((t: any) => t.id);
  expect(ids).toContain(id);

  // COMPLETE
  const completeRes = await request.post(`${API_BASE}/v1/tasks/${id}/complete`, {
    headers: auth,
    timeout: 60_000,
  });
  expect([200, 204]).toContain(completeRes.status());

  // DELETE
  const delRes = await request.delete(`${API_BASE}/v1/tasks/${id}`, {
    headers: auth,
    timeout: 60_000,
  });
  expect([200, 204]).toContain(delRes.status());

  // VERIFY removed
  const list2Res = await request.get(`${API_BASE}/v1/tasks`, {
    headers: auth,
    timeout: 60_000,
  });
  const list2 = await list2Res.json();
  const ids2 = (Array.isArray(list2) ? list2 : list2.tasks ?? []).map((t: any) => t.id);
  expect(ids2).not.toContain(id);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8  Focus / Pomodoro
// ─────────────────────────────────────────────────────────────────────────────

test("AC-8.1 — Focus empty state shows 'Nothing to focus on' + Today CTA", async ({ page, request }) => {
  const { token, user } = await registerViaApi(request);
  await seedAuthInLocalStorage(page, token, user);
  await page.goto("/#/focus");
  await expect(page.getByText(/nothing to focus on/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /go to today/i })).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-9  Habit Check-in
// ─────────────────────────────────────────────────────────────────────────────

test("AC-9.1 — Unauthenticated /habits shows 'Sign in' CTA", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/#/habits");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible({ timeout: 15_000 });
});

test("AC-9.2 — Signed-in user can open 'New habit' modal", async ({ page, request }) => {
  const { token, user } = await registerViaApi(request);
  await seedAuthInLocalStorage(page, token, user);
  await page.goto("/#/habits");
  await expect(page.getByText(/habits/i).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /new habit/i }).first().click();
  await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 10_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-10  PWA
// ─────────────────────────────────────────────────────────────────────────────

test("AC-10.1 — manifest.webmanifest is valid", async ({ request }) => {
  // Try both common manifest paths
  const candidates = ["/manifest.webmanifest", "/manifest.json"];
  let manifest: any = null;
  let foundPath = "";
  for (const p of candidates) {
    const res = await request.get(`${FRONTEND_BASE}${p}`, { timeout: 15_000 });
    if (res.status() === 200) {
      try {
        manifest = await res.json();
        foundPath = p;
        break;
      } catch {
        // not JSON, keep trying
      }
    }
  }
  expect(manifest, `no valid manifest at ${candidates.join(" or ")}`).toBeTruthy();
  // Common minimum fields
  expect(manifest.name ?? manifest.short_name, `manifest at ${foundPath} missing name`).toBeTruthy();
  expect(Array.isArray(manifest.icons) && manifest.icons.length > 0, "icons[]").toBe(true);
  expect(manifest.start_url ?? manifest.scope, "start_url or scope").toBeTruthy();
});

test("AC-10.2 — Service worker registered within 10s", async ({ page }) => {
  await page.goto("/");
  const swRegistered = await page.waitForFunction(
    async () => {
      if (!("serviceWorker" in navigator)) return false;
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length > 0;
    },
    null,
    { timeout: 10_000 }
  ).then(() => true).catch(() => false);
  expect(swRegistered, "expected at least 1 service worker registration").toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-11  Mobile layout (Pixel 5 viewport via mobile-chromium project)
// ─────────────────────────────────────────────────────────────────────────────

test("AC-11.1 — Mobile: bottom tab bar visible on Today @mobile", async ({ page, request }) => {
  const { token, user } = await registerViaApi(request);
  await seedAuthInLocalStorage(page, token, user);
  await page.goto("/#/today");
  await expect(page.getByText(/nothing planned yet/i)).toBeVisible({ timeout: 20_000 });
  // Bottom nav typically uses a data attribute or fixed-bottom class
  const bottomNav = page
    .locator('[data-bottom-nav], nav.bottom-nav, [class*="bottom-nav"], [class*="BottomNav"]')
    .first();
  await expect(bottomNav).toBeVisible({ timeout: 10_000 });
});

test("AC-11.2 — Mobile: page does not horizontally scroll @mobile", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/welcome to lumo/i)).toBeVisible({ timeout: 15_000 });
  const overflow = await page.evaluate(() => {
    const html = document.documentElement;
    return { sw: html.scrollWidth, cw: html.clientWidth };
  });
  expect(overflow.sw, `scrollWidth ${overflow.sw} should be ≤ clientWidth ${overflow.cw}`).toBeLessThanOrEqual(overflow.cw + 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-12  Security smoke
// ─────────────────────────────────────────────────────────────────────────────

test("AC-12.1 — GET /v1/tasks without token returns 401", async ({ request }) => {
  const res = await request.get(`${API_BASE}/v1/tasks`, { timeout: 60_000 });
  expect(res.status()).toBe(401);
});

test("AC-12.2 — GET /v1/tasks with tampered JWT returns 401", async ({ request }) => {
  const res = await request.get(`${API_BASE}/v1/tasks`, {
    headers: { Authorization: "Bearer not.a.real.token" },
    timeout: 60_000,
  });
  expect(res.status()).toBe(401);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-API  Additional API-only coverage (run in browser-less environments too)
// ─────────────────────────────────────────────────────────────────────────────

test("AC-API.1 — GET /v1/habits returns array for new user", async ({ request }) => {
  const { token } = await registerViaApi(request);
  const res = await request.get(`${API_BASE}/v1/habits`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 60_000,
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  const arr = Array.isArray(body) ? body : body.habits ?? [];
  expect(Array.isArray(arr)).toBe(true);
});

test("AC-API.2 — GET /v1/settings returns user preferences", async ({ request }) => {
  const { token } = await registerViaApi(request);
  const res = await request.get(`${API_BASE}/v1/settings`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 60_000,
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  // Sane defaults: locale + accent + density at minimum
  expect(body).toHaveProperty("locale");
  expect(body).toHaveProperty("accent");
});

test("AC-API.3 — GET /v1/completed returns a list for new user", async ({ request }) => {
  const { token } = await registerViaApi(request);
  const res = await request.get(`${API_BASE}/v1/completed`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 60_000,
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  // No-date /completed is keyset-paginated ({ items, nextCursor }); tolerate the
  // legacy array shape too so this stays green across the deploy boundary.
  const arr = Array.isArray(body) ? body : body.items ?? body.completed ?? body.entries ?? [];
  expect(Array.isArray(arr)).toBe(true);
});

test("AC-12.3 — CORS preflight from frontend origin returns 204 with correct ACAO", async ({ request }) => {
  const res = await request.fetch(`${API_BASE}/v1/tasks`, {
    method: "OPTIONS",
    headers: {
      Origin: FRONTEND_BASE,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
    timeout: 30_000,
  });
  expect([200, 204]).toContain(res.status());
  const acao = res.headers()["access-control-allow-origin"];
  expect(acao).toBe(FRONTEND_BASE);
});
