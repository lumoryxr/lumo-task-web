# DFX (Design-for-X) Coverage Matrix

**DFX = Design for X** — the cross-cutting quality attributes a production system
must hold beyond "the feature works": security, robustness, recoverability,
observability, scalability, interoperability. Where the happy-path integration
suite proves *features* work end-to-end, the DFX suite proves the system *holds
its quality attributes* under hostile, malformed, and boundary input — the
failure modes that don't show up in feature tests but bite in production.

## Where it runs

| Layer | File | When |
|---|---|---|
| Integration (real HTTP + real SQLite) | `backend/src/test/dfx.integration.test.ts` | Daily `Integration Regression` workflow + `make test-integration-dfx` |
| Fast per-PR guard (in-process) | `backend/src/test/api/error-handling.test.ts` | Every PR (backend API suite) |

The daily workflow (`.github/workflows/integration-regression.yml`) runs against
a **fresh, ephemeral environment** (brand-new temp SQLite, no production data) so
results are reproducible and never touch live infra. It is **never** triggered on
push/PR.

## Coverage by dimension

| DFX dimension | What it guarantees | Covered cases (in `dfx.integration.test.ts`) |
|---|---|---|
| **Design for Security** | No unauthorized access, no cross-tenant leakage, no injection, no weak credentials | missing token → 401; garbage/malformed bearer → 401; cross-tenant read/patch/delete → 404 (no leak); weak password rejected at registration; SQL-injection-shaped input stored as literal data (table survives). **Tenant isolation now exercised across all user-scoped CRUD resources** — `tasks` **+ `people` / `countdowns` / `habits` / `templates`**: attacker PATCH/DELETE of another tenant's row → 404 (owner's row survives & unmutated); attacker's list never contains the owner's row (#158; `templates` added 2026-06-29). **Plus the id-addressed state-changing sub-resource endpoints** (#165 + #190): cross-tenant `POST /completed/:id/reopen` → 404 (owner's entry not tombstoned); `POST /habits/:id/log` → 404 (no check-in written); `DELETE /habits/:id/log/:date` → 204 idempotent **but owner's check-in survives** (silent-IDOR guard); `POST /focus/sessions` with another tenant's `task_id` → 200 no-op **but owner's `pomos_done` unchanged & no completed entry leaked** (silent-IDOR guard — endpoint never 404s, so only state-survival catches it; #190). **And the `tasks` state-changing sub-resources** (#194): cross-tenant `POST /tasks/:id/complete` → 404 (owner's task stays open, no completed entry spawned under either tenant); `POST /tasks/:id/uncomplete` → 404 (owner's task stays completed, its entry survives). **Plus the caller-supplied-`taskId` AI surface** (#209): cross-tenant `POST /ai/breakdown` → 404 (no task content disclosed into the attacker's AI response, no cloud-quota burn against the owner's data); non-existent `taskId` → 404 `NOT_FOUND` (not 5xx), proving the scoped-load 404 fires before any provider/LLM call. **Plus the cross-RESOURCE foreign-key reference** (#220): a task may only reference a project the caller owns — `POST /tasks` and `PATCH /tasks/:id` with another tenant's `project_id` → **400 `INVALID_PROJECT`** (note: 400, a body-field validation, not the 404 the path-id IDOR cases use), with the task not created / its `project_id` left unmutated, and the own-project link still succeeding (teeth) |
| **Design for Robustness** | Malformed / wrong-typed / missing input degrades to 4xx, never a 5xx crash | malformed JSON body → 400 `INVALID_JSON` (proven a **global** handler — exercised on `tasks` + `people` / `countdowns` / `habits` / `templates`, #158); missing required field → 400; wrong field type → 400; out-of-enum value → 400; **nested-payload violation (templates `payload.duration` out of range) → 400** (validation reaches into the JSON payload column, #184); **bounded nested payload on `projects` (#213/#219):** over-cap `content` (> 1 MB row-size cap), over-length nested goal (`goals[].text` > 200, validation reaches into the array element), and over-cap `goals` array (> 50) all → 400 `VALIDATION_ERROR` naming the offending dotted field — there is **no body-size middleware**, so the Zod caps are the only bound on row growth; an over-cap body still degrades to a clean 400 (not 5xx) and leaves the server healthy; unknown route → 404 |
| **Design for Recoverability** | A bad request never poisons the server; the next request still works | invalid pagination cursor → 400 `INVALID_CURSOR`; burst of bad requests followed by a healthy request → 200; operation on non-existent id → 404 |
| **Design for Observability** | Health/readiness are meaningful; every error has a consistent, machine-readable shape | `/health` → 200 `{ok:true}` (liveness); `/ready` reflects a real DB probe (readiness); business errors all carry `{ error: { code, message } }` |
| **Design for Scalability** | List responses are always bounded; pagination is correct under volume | **`/v1/tasks`:** default page bounded (≤ 50) with `nextCursor`; over-max `limit` (>200) rejected → 400 (no unbounded read); cursor paging walks every row exactly once — no dupes, no omissions. **`/v1/completed` full history (#164, #202):** the highest-growth list (every completion ever) — its keyset pagination is exercised separately because its contract *differs* (DEFAULT 200 / MAX 500, over-max `limit` **clamped** not 400-rejected): explicit `limit` bounds the page + yields `nextCursor`; over-max `limit` → 200 clamped ≤ 500 (**not** 400, unlike tasks); cursor paging walks every entry exactly once |
| **Design for Interoperability** | Stable wire contract clients can rely on | JSON `Content-Type`; `DELETE` → 204; successful create → 201 with a server-assigned id |

## Bugs this suite has already caught

- **Malformed JSON body → 500 instead of 400** (fixed by honoring Hono's
  `HTTPException` in `app.onError`, PR for issue: daily-integration-dfx). A
  malformed payload could masquerade as a server outage / 5xx alert.

## Auto-replenishment — keeping coverage honest as the product grows

This matrix is a contract, not a snapshot. Two mechanisms keep it current:

1. **Every feature PR must extend it.** A PR that adds or changes an endpoint
   adds the matching integration + DFX cases in the same PR. This is part of the
   engineering discipline (QA gate), not an afterthought.
2. **Periodic coverage-gap audit.** The recurring engineering loop diffs the live
   API surface (routes) against the dimensions covered here and opens a PR to fill
   any gap — new endpoint with no DFX row, new error path with no robustness case,
   new list endpoint with no scalability case.

When a dimension is intentionally not covered for an endpoint, say so explicitly
here rather than leaving a silent hole.

## Coverage-gap audit log

- **2026-06-28 (#158)** — Audit found tenant-isolation / malformed-body DFX cases
  existed **only for `/v1/tasks`**, while the matrix advertised them as system-wide.
  Closed by parametrizing the isolation + `INVALID_JSON` cases over `people`,
  `countdowns`, and `habits` (12 new cases). All three were verified to already
  scope correctly — **the gap was in the tests, not the code** (no production change).
- **2026-06-28 (#165)** — Follow-up audit found #158 only covered **CRUD-by-id**
  (`PATCH`/`DELETE /:id`). The id-addressed **state-changing sub-resource** endpoints
  — `POST /completed/:id/reopen`, `POST /habits/:id/log`, `DELETE /habits/:id/log/:date`
  — had **no** tenant-isolation coverage despite being the classic IDOR surface. The
  un-check-in `DELETE` is the riskiest: it's idempotent (`204` on no-match), so a
  dropped `WHERE user_id` would leak **silently** with no status-code change — only an
  "owner's row survives" assertion catches it. Closed with 3 new cases. All three
  handlers verified to already scope by `user_id` — **gap in the tests, not the code**.
- **2026-06-29 (#173 templates)** — The `templates` CRUD resource shipped after the
  #158/#160 isolation sweep, so the integration matrix never exercised it. Added
  `templates` to the parametrized tenant-isolation + `INVALID_JSON` cases (4 new
  cases: cross-tenant PATCH/DELETE → 404 with owner's row surviving, list never
  leaks the owner's row, malformed body → 400). Handler already scopes by
  `user_id` — **gap in the tests, not the code** (no production change).
- **2026-06-29 (#184)** — Follow-up to the #173 templates isolation work: templates
  still had **no daily integration coverage in `integration.test.ts`** and **no
  robustness case for nested-`payload` validation**. Closed by: a full templates CRUD
  lifecycle in `integration.test.ts` (create/list/rename/payload-replace/delete, 404
  paths, defaults applied) over real HTTP + real SQLite; and a DFX robustness case
  proving nested-`payload` validation rejects an out-of-range field (`duration` ∉
  0..1440) → 400 (not 5xx). Handler verified to already scope by `user_id` and
  re-encode the payload through the schema — **gap in the tests, not the code** (no
  production change).
- **2026-06-29 (#202 completed pagination scalability)** — The DFX **Scalability**
  dimension advertised "list responses are always bounded; pagination correct under
  volume" as system-wide but only exercised `/v1/tasks`. The full-history completed
  log (`GET /v1/completed`, no `?date`, keyset-paginated since #164) — the list most
  prone to unbounded growth — had **no** integration scalability coverage, and its
  contract *differs* from tasks (DEFAULT 200 / MAX 500, over-max `limit` **clamped**
  via `Math.min` rather than 400-rejected). A regression that harmonized it with
  tasks (reject over-max → 400) or dropped the clamp (→ unbounded read) would slip
  past the tasks-only cases. Closed with 3 cases over real HTTP + real SQLite:
  explicit `limit` bounds the page + yields `nextCursor`; over-max `limit` → 200
  clamped (≤ 500), **not** 400; cursor paging walks every entry exactly once (no
  dupes/omissions). Handler already clamps + keyset-paginates correctly — **gap in
  the tests, not the code** (no production change).
- **2026-06-29 (#190 focus/sessions)** — Follow-up to the #165 sub-resource IDOR
  sweep: that sweep enumerated `completed/reopen` + `habits/:id/log` (×2) but
  **missed `POST /v1/focus/sessions`**, which is the same class — it writes a
  `completed_entries` row and increments the referenced task's `pomos_done` keyed
  by a caller-supplied `task_id`. It is the **most insidious** of the set: a
  cross-tenant `task_id` is silently skipped and the endpoint still returns
  `200 {ok:true}` (never 404), so a dropped scope would leak with **no status-code
  change** — only a state-survival assertion (owner's `pomos_done` unmoved + no
  leaked completed entry) catches it. Added 1 DFX case. The handler was already
  gated by the SELECT's `WHERE user_id`, but the `pomos_done` UPDATE itself was
  **unscoped** (`WHERE id`), relying solely on that upstream gate; hardened the
  UPDATE with `AND user_id` as defense-in-depth so the write is self-defending
  (no happy-path change). **Test gap + latent footgun closed** — not an active
  vulnerability.
- **2026-06-30 (#209 ai/breakdown)** — Follow-up to the #165/#190 caller-supplied-id
  IDOR sweeps: those reached the CRUD + sub-resource routes but never the `/v1/ai`
  surface. `POST /v1/ai/breakdown` takes a caller-supplied `taskId` and loads that
  task to feed its title/description into the LLM prompt — a dropped `WHERE user_id`
  would **disclose another tenant's task content** into the attacker's AI response
  **and** silently burn the attacker's cloud-AI quota against the owner's data. Added
  2 DFX cases over real HTTP + real SQLite: cross-tenant `taskId` → 404 (404 body
  asserted not to echo the owner's task content) with the owner's task surviving; a
  non-existent `taskId` → 404 `NOT_FOUND` (not 5xx). The handler already scopes the
  load with `AND user_id` and returns 404 **before** `getProviderConfig()`/the LLM,
  so both cases are fully verifiable with no AI provider configured — **gap in the
  tests, not the code** (no production change).
- **2026-06-30 (#220 task→project reference)** — Follow-up to the #165/#190/#194/#209
  caller-supplied-id IDOR sweeps, which all covered CRUD-by-id + state-changing
  sub-resources but **not** the cross-RESOURCE foreign-key reference introduced by
  `task.project_id` (#213). The task write handler restricts `project_id` to a project
  the caller owns (`projectIsOwned()` → `400 INVALID_PROJECT` on `POST /tasks` and
  `PATCH /tasks/:id`) — a distinct IDOR class that rejects with **400** (body-field
  validation), not the 404 the path-id cases use. A dropped `WHERE user_id` in that guard
  would let a tenant file tasks into another tenant's project (cross-tenant linkage +
  project-id leakage). Covered at the unit/API layer (`api/tasks.test.ts`, in-memory) but
  never over real HTTP + real file SQLite in the daily regression. Closed with 3 cases:
  cross-tenant `POST` → 400 (task not created), cross-tenant `PATCH` move → 400
  (`project_id` left unmutated), and a teeth/sanity case proving the own-project link
  still succeeds (201, round-trips). Handler verified already correct — **gap in the
  tests, not the code** (no production change).
- **2026-06-30 (#213/#219 projects payload bounds)** — The `projects` CRUD resource
  (shipped #213/#219) was reached by the daily DFX suite only through the #158 parametrized
  tenant-isolation + malformed-JSON cases; #220 added the task→project *reference* boundary
  but never projects' own **nested/bounded payload** robustness. Projects carry the app's
  richest, most growth-prone payload — a nested `goals[]` array and a rich-text `content`
  document — and there is **no body-size middleware**, so the Zod caps (`content` ≤ 1 MB,
  `goals` ≤ 50, each `goals[].text` ≤ 200) are the *only* bound on row growth. A regression
  that loosened/dropped a cap, or 5xx'd on an oversized body instead of a clean 400, would
  slip past every existing case (the api-layer test only covers a malformed *shape*, never
  the size/length boundaries, and runs in-process — not over real HTTP in the daily
  regression). Sharpened by the in-flight TipTap inline-image work (#222), which inflates
  `content` with base64 toward the cap. Closed with 3 cases over real HTTP + real SQLite:
  over-cap `content` → 400 `VALIDATION_ERROR` (naming `content`) **+ server stays healthy
  afterwards** (recoverability/no-poison); over-length nested `goals.0.text` → 400 (path
  asserted, proving validation reaches into the array element); over-cap `goals` array → 400
  (naming `goals`). Each asserts the dotted field path so the test has teeth — the *right*
  bound fired, not an incidental 400. Handler/contract verified already correct — **gap in
  the tests, not the code** (no production change).
- **2026-06-29 (#194)** — Follow-up to the #165 sub-resource IDOR sweep, which covered
  `completed/reopen` + `habits/:id/log` (×2) but **not** the two state-changing
  sub-resources on the primary `tasks` resource: `POST /tasks/:id/complete` and
  `POST /tasks/:id/uncomplete`. `complete` is the highest-impact of the set — a dropped
  `WHERE user_id` would flip the owner's task **and** write a completed-log entry (plus
  spawn a recurrence) under the wrong tenant. Closed with 2 cross-tenant cases: attacker
  complete → 404 (owner's task stays open, no completed entry under either tenant);
  attacker uncomplete → 404 (owner's task stays completed, its entry survives). Both
  handlers verified to already scope by `user_id` in their guarding `SELECT` — **gap in
  the tests, not the code** (no production change). Mutation-tested: dropping the guard
  turns each case red, confirming teeth.
