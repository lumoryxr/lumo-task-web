# Lumo Task — Product Roadmap / 路线图

> Single source of truth for the autonomous engineering loop (`lumo-auto-engineering-loop`, every 2h) and for planning. Each run picks **one** item — top-down by phase — and finishes it through the full flow (PM → contract → TDD → QA → gates → one-round code-review → CI → merge), then updates this file.

## Vision / 愿景
A genuinely delightful, trustworthy personal-productivity app people love and tell their friends about. **Make the fundamentals beautiful and rock-solid first**, then layer on **differentiated, viral-worthy** features — never feature-bloat over polish.

精致的体验 + 稳固的后台,再叠加有创新、能传播的功能。

## Prioritization — strict order (Jalen 2026-06-24) / 优先级
1. **Phase 1 — 精致 / 体验 / 界面 (Polish & UX).** Make what already exists feel premium. **← current focus.**
2. **Phase 2 — 安全 / 稳定 (Security & Stability).** Backend hardening + reliability, production-grade at scale.
3. **Phase 3 — 创新功能 (Innovative features).** Only after 1 & 2 feel done. Features must be **differentiated + have viral / "未来能火" potential** — these are **product decisions**: the loop writes a crisp PRD here and **waits for Jalen**; it does not auto-build large features.

The loop prefers the **highest unchecked item in the lowest-numbered phase** that is low-risk and finishable in one run. Genuinely urgent security/stability fixes may jump ahead.

---

## Phase 1 — Polish & UX  ⬅ current focus
Grounded in the current app (12 pages; `ErrorBoundary` + `ToastStack` exist; pet/gamification system present).

- [ ] **Route-level code splitting** — `React.lazy` + `Suspense` per page + vite `manualChunks`. Main chunk is ~800KB today (no splitting) → slow first paint. Biggest single UX+perf win.
- [ ] **Loading skeletons** — replace blank/jank during fetches (tasks, habits, stats, completed) with skeleton placeholders (none exist yet).
- [ ] **Client request resilience** — timeout + `AbortController` + limited retry in `web-app/src/api/client.ts` (none today): no infinite spinners on slow networks.
- [ ] **Empty-state audit** — consistent, friendly empty states (illustration + clear CTA) on every list page.
- [ ] **Error-state UX audit** — every API failure surfaces a toast/inline message (`ToastStack` exists) instead of silent failure.
- [ ] **i18n completeness** — sweep for any hardcoded/untranslated EN or ZH string.
- [ ] **Accessibility pass** — focus-visible, ARIA on icon buttons, keyboard nav for modals/command palette, contrast check.
- [ ] **Visual consistency** — spacing/typography/color-token audit; tighten modal/card/topbar rhythm.
- [ ] **Micro-interactions** — purposeful transitions (task complete, quadrant move, pet reactions), honoring `reduced_motion`.
- [ ] **Mobile/responsive refinement** — verify Pixel-5-class layouts on every page; fix overflow / tap-target issues.

## Phase 2 — Security & Stability
From the production-readiness review (#46) + ongoing. Already shipped: #34/#36/#38/#40/#42/#45/#50 (SSRF×2, JWT/crypto, brute-force/timing, indexes+health, liveness/readiness, fail-fast secrets) and pagination #48.

- [ ] **Pagination generalization** — apply `lib/cursor` + `{items,nextCursor}` (PR #48) to `completed` / `people` / `habits` / `countdowns`; update each consumer + e2e mocks.
- [ ] **Structured logging + request correlation** — JSON logger + per-request id + error id from `app.onError` (today only `console.*`, can't trace a prod 500).
- [ ] **Error tracking (Sentry/OTel)** — capture + alert on backend exceptions.
- [ ] **Idempotency keys** — on create endpoints so client retries don't duplicate rows.
- [ ] **N+1 / batch writes** — `ai/classify` does N sequential UPDATEs; batch into one transaction.
- [ ] **Refresh tokens / shorter access-token TTL** — 7-day JWT today; add rotation.
- [ ] **Versioned migrations** — recorded, ordered, reversible runner (replace ad-hoc `CREATE IF NOT EXISTS`).
- [ ] **DNS-rebinding SSRF residual** — IP-pinning dispatcher for outbound fetch (from #41/#42).
- [ ] **DB backup / PITR** — Turso free has no PITR; document/automate backups.
- [ ] **SQLite single-writer ceiling** — ADR on Postgres / per-tenant sharding before large-scale rollout (plan-only; needs Jalen).

### Awaiting Jalen — do not auto-build
- **/register account enumeration (#46 #4)** — A: accept trade-off (signin timing is defense-in-depth) vs B: email-verification flow. *Product/contract call.*

## Phase 3 — Innovative features (propose-only; needs Jalen's go-ahead)
Lead with the app's **unique hooks** — the virtual-pet/gamification system and shareable stats — the strongest "未来能火" / viral levers. The loop drafts a PRD and pings Jalen; it does not build these unilaterally.

- [ ] *(proposal)* **Pet companion depth** — pet (Dog/Fox/Panda evolution, PetChat) reacts to real productivity; deeper evolution/moods/streak-driven growth → emotional attachment + retention.
- [ ] *(proposal)* **Shareable "productivity wrapped" / streak cards** — extend `ShareCard` into one-tap social shares (weekly/monthly recap, streak milestones) → organic growth loop.
- [ ] *(proposal)* **NL + AI planning** — "plan my day" / natural-language capture on the existing AI tools; smart auto-sort + focus suggestions.
- [ ] *(proposal)* **Light social / accountability** — optional shared focus rooms or buddy streaks.
- [ ] *(proposal)* **Deeper integrations** — Outlook + Google/ICS two-way; Slack/Notion capture.
- [ ] *(standard features, lower bar — confirm with Jalen)* recurring tasks · subtasks · due-date push notifications · macOS/Linux Electron builds · real-time multi-device sync · team/shared workspace · public API.

---

## Current State / 当前状态 (shipped & in production)
Today view + recommended card + CompletedTimeline · Eisenhower Matrix (drag-drop) · Focus/Pomodoro (Web Worker) · AI classify (LLM + heuristic) · server-side task search · habit check-in · 5-step onboarding · bilingual EN/ZH · accent theming · calendar week view · Stats + shareable PNG · PWA · mobile bottom-tab layout · Lumo pet celebration moments · Hono+SQLite/Turso backend, JWT auth, REST · Electron Windows app · GitHub Actions CI/CD.

## Done log
- 2026-06-24: Security/architecture hardening — #34/#36/#38/#40/#42/#45/#50; task-list pagination #48; review report #46.

_Last restructured: 2026-06-24 (phase prioritization). Maintained by the autonomous loop each run._
