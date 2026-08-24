# Production Site Validation — Test Plan

**Date:** 2026-06-23
**Author:** QA (Mina)
**Target environment:**

| Component | URL |
|---|---|
| Frontend (Render static) | https://lumo-task-frontend.onrender.com |
| Backend API (Render web service) | https://lumo-task-backend-1c3x.onrender.com |
| API version | `/v1` |

---

## 1. Goal & scope

End-to-end validation of the live production deployment, covering **≥50% of the README's listed features (≥7 of 13)** via Playwright E2E. This run targets the **real** frontend bundle and **real** backend (no mocks, no dev server), to verify that what users experience today actually works.

In scope:

| # | Feature (README) | Coverage |
|---|---|---|
| 1 | Today View | ✅ |
| 2 | Eisenhower Matrix | ✅ |
| 3 | Focus / Pomodoro | ✅ (UI only — short timer assertion, no full 25-min run) |
| 4 | Habit Check-in | ✅ |
| 5 | Onboarding | ✅ |
| 6 | Bilingual EN/ZH | ✅ |
| 7 | PWA | ✅ (manifest + service worker registration) |
| 8 | Mobile Layout | ✅ (375×667 viewport, bottom nav) |

Coverage = **8 / 13 ≈ 62%**, comfortably above the 50% bar.

Out of scope this round (deferred to follow-up runs):

| Feature | Reason |
|---|---|
| AI Classify | Requires LLM provider API key in browser — non-deterministic, user-supplied secret |
| Calendar Week View | Drag-and-drop on a real site is flaky in headless Chromium; needs dedicated visual run |
| Stats and Export | PNG export uses canvas; verify in a separate visual diff run |
| Accent Theming | Already covered by existing `web-app/e2e/ui.spec.ts` TC41–TC44 (mock) |
| Electron Desktop | Out of frontend-site scope |

---

## 2. Acceptance criteria

Each feature has explicit ACs the Playwright spec will assert.

### AC-1 — Site availability
- **AC-1.1** `GET /` returns HTTP 200 with the SPA shell.
- **AC-1.2** Backend `GET /health` returns 200 `{ok:true}`.
- **AC-1.3** No console errors on first paint of `/#/onboarding`.

### AC-2 — Onboarding
- **AC-2.1** First visit lands on `/#/onboarding` showing step `1 / 5`.
- **AC-2.2** Primary CTA "Let's set it up" advances to step 2.
- **AC-2.3** Skip button exits onboarding → `/#/login`.

### AC-3 — Bilingual EN/ZH
- **AC-3.1** Onboarding step 2 shows both "English" and "中文" language options.
- **AC-3.2** Selecting "中文" updates UI text to Chinese (e.g. "继续" replaces "Continue").

### AC-4 — Auth (register + login, real backend)
- **AC-4.1** `POST /v1/auth/register` with a fresh email returns 201 `{token, user}`.
- **AC-4.2** Same email re-registered returns 409 `EMAIL_TAKEN`.
- **AC-4.3** Successful UI register navigates to `/#/today` or `/#/matrix`.
- **AC-4.4** Sign-out then sign-in with the same credentials succeeds.

### AC-5 — Today View (signed-in, real data)
- **AC-5.1** A freshly-registered user sees the "Nothing planned yet" empty state.
- **AC-5.2** After creating a task with `today=true`, it appears in "Today's plan".

### AC-6 — Eisenhower Matrix (signed-in, real data)
- **AC-6.1** All four quadrant headers (Do first / Schedule / Delegate / Drop) visible.
- **AC-6.2** A task created with `quadrant=Q1` renders in the "Do first" quadrant.

### AC-7 — Task CRUD via real backend (Today happy path)
- **AC-7.1** `POST /v1/tasks` creates a task and returns 201 with an id.
- **AC-7.2** `GET /v1/tasks` includes the created task.
- **AC-7.3** `POST /v1/tasks/:id/complete` marks the task completed.
- **AC-7.4** `DELETE /v1/tasks/:id` removes the task; subsequent GET excludes it.

### AC-8 — Focus / Pomodoro
- **AC-8.1** Empty state shows "Nothing to focus on" with "Go to Today" CTA.
- **AC-8.2** With an active task selected, the focus page renders a `MM:SS` timer.

### AC-9 — Habit Check-in
- **AC-9.1** Unauthenticated `/#/habits` shows "Sign in" CTA.
- **AC-9.2** Signed-in user can open the "New habit" modal.

### AC-10 — PWA
- **AC-10.1** `GET /manifest.webmanifest` returns valid JSON with `name`, `icons`, `start_url`.
- **AC-10.2** A service worker is registered (navigator.serviceWorker.controller or registration count ≥ 1 within 5s).

### AC-11 — Mobile layout (375×667 viewport)
- **AC-11.1** On Today page, a mobile bottom tab bar is visible (Today/Matrix/Focus/Settings).
- **AC-11.2** Page does not horizontally scroll (document scrollWidth ≤ viewport width).

### AC-12 — Security smoke
- **AC-12.1** `GET /v1/tasks` without token returns 401.
- **AC-12.2** `GET /v1/tasks` with tampered JWT returns 401.
- **AC-12.3** CORS preflight from `https://lumo-task-frontend.onrender.com` returns 204 with `Access-Control-Allow-Origin` echoing the frontend origin.

---

## 3. Test matrix

| Dimension | Values |
|---|---|
| Browser | Chromium (Desktop Chrome) |
| Viewports | Desktop 1280×720; Mobile 375×667 (project `mobile-chromium`) |
| Locales | EN (default), ZH (one assertion) |
| Auth state | Anonymous, freshly-registered ephemeral user |
| Network | Live (no mocks). Each test gets its own ephemeral account via `qa-bot-<run-id>-<test-id>@lumo-test.example`. |

---

## 4. Test environment & data hygiene

- **Ephemeral accounts.** Each test creates a unique account `qa-bot-<random-12-chars>@lumo-test.example` so reruns don't collide. Accounts are deliberately leaked in production Turso DB (acceptable: small footprint, all marked by `@lumo-test.example` suffix; a future cleanup endpoint can sweep).
- **No production user data is touched.** Tests never sign in as `alex@stride.studio` or any human account.
- **Rate limit awareness.** Auth route is 10 attempts/IP/minute. Suite caps register+signin operations to stay under that ceiling per minute (≤2 register-then-signin pairs per second over the run).
- **Cold start.** First request to backend may take ~30s if Render free-tier spun down. Test timeouts set to 60s on first API call.

---

## 5. Tooling

- **Playwright** `^1.x` (already in `web-app/package.json` devDeps).
- New config: `web-app/playwright.production.config.ts` — targets `PROD_BASE_URL`, no `webServer`, adds `mobile-chromium` project.
- New spec: `web-app/e2e/production.spec.ts` — covers AC-1 through AC-12 above.
- Run with `PROD_BASE_URL=https://lumo-task-frontend.onrender.com npx playwright test --config=playwright.production.config.ts`.

---

## 6. Exit criteria

- ≥7 features asserted (target met → 8).
- Every reproducible failure has a filed issue on `lumoryxr/lumo-task-web` with: title, severity, repro steps, expected vs actual, screenshot, environment.
- This test plan + the spec are merged via PR following [the engineering process](../process/engineering-process.md): QA can write its own E2E; PR must pass CI and at least one reviewer.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Render cold start adds ~30s latency | First test in run pre-warms via direct `/health` ping with 60s timeout. |
| Rate limit `429` from `/v1/auth` | Cap registrations: ≤2/sec, ≤8/min in this suite. |
| Test data accumulates in Turso | Acceptable for now (`@lumo-test.example` suffix lets a future cleanup endpoint sweep). |
| Headless Chromium can't run real LLM | AI Classify is explicitly deferred to a separate visual run with stubbed API key. |
