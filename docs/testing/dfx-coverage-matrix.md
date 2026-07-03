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
| **Design for Security** | No unauthorized access, no cross-tenant leakage, no injection, no weak credentials | missing token → 401; garbage/malformed bearer → 401; cross-tenant read/patch/delete → 404 (no leak); weak password rejected at registration; SQL-injection-shaped input stored as literal data (table survives). **Tenant isolation now exercised across all user-scoped CRUD resources** — `tasks` **+ `people` / `countdowns` / `habits` / `templates`**: attacker PATCH/DELETE of another tenant's row → 404 (owner's row survives & unmutated); attacker's list never contains the owner's row (#158; `templates` added 2026-06-29). **Plus the id-addressed state-changing sub-resource endpoints** (#165 + #190): cross-tenant `POST /completed/:id/reopen` → 404 (owner's entry not tombstoned); `POST /habits/:id/log` → 404 (no check-in written); `DELETE /habits/:id/log/:date` → 204 idempotent **but owner's check-in survives** (silent-IDOR guard); `POST /focus/sessions` with another tenant's `task_id` → 200 no-op **but owner's `pomos_done` unchanged & no completed entry leaked** (silent-IDOR guard — endpoint never 404s, so only state-survival catches it; #190). **And the `tasks` state-changing sub-resources** (#194): cross-tenant `POST /tasks/:id/complete` → 404 (owner's task stays open, no completed entry spawned under either tenant); `POST /tasks/:id/uncomplete` → 404 (owner's task stays completed, its entry survives). **Plus the caller-supplied-`taskId` AI surface** (#209): cross-tenant `POST /ai/breakdown` → 404 (no task content disclosed into the attacker's AI response, no cloud-quota burn against the owner's data); non-existent `taskId` → 404 `NOT_FOUND` (not 5xx), proving the scoped-load 404 fires before any provider/LLM call. **Plus the cross-RESOURCE foreign-key reference** (#220): a task may only reference a project the caller owns — `POST /tasks` and `PATCH /tasks/:id` with another tenant's `project_id` → **400 `INVALID_PROJECT`** (note: 400, a body-field validation, not the 404 the path-id IDOR cases use), with the task not created / its `project_id` left unmutated, and the own-project link still succeeding (teeth). **Plus the generic sync chokepoint** (`POST /v1/sync/pull` + `/push`, #255) — the single manifest-driven engine that scopes **all** syncable entities at once (highest blast radius): pull is tenant-scoped (Bob never pulls Alice's rows; positive control that Alice does); push forces `user_id` from the JWT (body-supplied `user_id` lands under the caller, never the victim); the cross-user id-collision guard makes Bob's push of a row colliding with Alice's id — with a **strictly-newer HLC** so LWW alone would apply — a no-op (Alice's row survives, Bob doesn't acquire it); unauthenticated pull/push → 401. Each isolation invariant mutation-tested (collision-guard mutation reddens exactly its case). **Plus the bulk-import log-ownership guard** (`POST /v1/habits/migrate`, #276) — migrate's *only* daily-suite presence: it writes the shared `habit_logs` keyspace with a client-supplied `habitId` per log, so a caller bulk-importing a log keyed to another tenant's habit id must have it **dropped** (`migrated.logs` counts only owned logs; the attacker's `GET /habits/logs` never gains a row for the foreign habit id; positive control that their own migrated log *is* imported). Mutation-tested (removing the ownership guard reddens exactly this case) |
| **Design for Robustness** | Malformed / wrong-typed / missing input degrades to 4xx, never a 5xx crash | malformed JSON body → 400 `INVALID_JSON` (proven a **global** handler — exercised on `tasks` + `people` / `countdowns` / `habits` / `templates`, #158); missing required field → 400; wrong field type → 400; out-of-enum value → 400; **nested-payload violation (templates `payload.duration` out of range) → 400** (validation reaches into the JSON payload column, #184); **bounded project-kind template payload (#236, project-templates PR1 #233):** the new `z.union` project variant carries its own JSON-column bounds (`payload.content` ≤ 1 MB, `payload.goals` ≤ 50 / `goals[].text` ≤ 200, and **`payload.tasks` ≤ 100** task blueprints — a bound *unique* to project templates) with no body-size middleware, so those Zod caps are the only bound on template row growth — over-cap `payload.content`, over-length `payload.goals.0.text`, and over-cap `payload.tasks` array all → 400 `VALIDATION_ERROR` naming the offending dotted `payload.*` path (proving the right bound fired inside the union's project variant), the over-cap `content` case pairing the rejection with a valid project-template create → 201 (recoverability + proof it was the cap, not the union structure, that rejected); **bounded nested payload on `projects` (#213/#219):** over-cap `content` (> 1 MB row-size cap), over-length nested goal (`goals[].text` > 200, validation reaches into the array element), and over-cap `goals` array (> 50) all → 400 `VALIDATION_ERROR` naming the offending dotted field — there is **no body-size middleware**, so the Zod caps are the only bound on row growth; an over-cap body still degrades to a clean 400 (not 5xx) and leaves the server healthy; **format-bounded `tasks.remind_at` (#176):** the scheduler-driving reminder field is gated only by a wall-clock datetime regex — malformed (`"tomorrow"`) and plausible-but-incomplete (date-only, no time) values → 400 `VALIDATION_ERROR` naming `remind_at` on **both** create and update, a valid value round-trips through storage, and a rejected `PATCH` leaves the stored value unmutated (no partial poison of the scheduler's input); **format-bounded `countdowns.date` (#240):** the solar ISO anchor that the "days until" math **and** the lunar-recurrence engine parse is gated only by a strict date-only regex (`^\d{4}-\d{2}-\d{2}$` on both create + partial update) — garbage (`"someday"`) **and** a plausible-but-wrong full-datetime (`2026-07-01T09:30`, a valid `remind_at` shape) → 400 `VALIDATION_ERROR` naming `date` on **both** create and update, a valid value round-trips through storage (verified via the owner's list — no GET /:id), and a rejected `PATCH` leaves the stored date unmutated; **format-bounded settings reminder times (#264):** `morning_reminder_time` / `evening_reminder_time` on `PATCH /v1/settings` — the `HH:MM` anchors stored verbatim and returned by `GET /v1/settings` to drive the client's morning/evening reminder scheduling — are gated only by a shape regex `^\d{2}:\d{2}$` (nullable/optional), settings' *only* presence in this daily suite; malformed (`"9am"`) **and** a single-digit near-miss (`"9:5"`, plausible but violating the two-digit shape) → 400 `VALIDATION_ERROR` naming the field, a valid `HH:MM` round-trips through `GET`, and a rejected `PATCH` leaves the stored value unmutated (no partial poison of the scheduler's input). **Note — settings SSRF is intentionally NOT at this daily layer:** the `ai_configs_update.baseUrl` private-IP SSRF guard stays covered by the in-process `api/settings.test.ts`; in the daily harness `dbMode()` is `local`, so `assertSafeOutboundUrl(raw, allowPrivate=true)` early-returns before the private-IP block, which would make a daily private-IP case a false-green — so it is deliberately omitted here rather than added misleadingly. **format-bounded habit check-in `date` (#267):** the key of every `habit_logs` row and the sole input to the client's streak computation, gated **only** by a strict date-only regex `^\d{4}-\d{2}-\d{2}$` on **two** surfaces — the `POST /:id/log` JSON body **and** the `DELETE /:id/log/:date` **path param**. The DELETE is the insidious surface: it is idempotent (`204` on no-match), so a dropped param bound would slip a bad date into an unguarded `DELETE … WHERE date = :date` with no status-code change. Malformed (`"someday"`) **and** a plausible-but-wrong full-datetime (`"2026-07-02T09:30"`, a valid `remind_at` shape) → 400 `VALIDATION_ERROR` naming `date` on the POST body; a valid `date` round-trips (`POST` → `201`, reflected by `GET /v1/habits/logs`); a malformed `date` on the `DELETE` path param → 400 with a pre-existing valid check-in left intact (no partial poison — the idempotent delete never runs on a bad date). **format/length-bounded `people` avatar fields (#279):** the `people` resource's three display-driving inputs are each gated **only** by a Zod format/length rule at the route boundary — `color` (`^#[0-9a-fA-F]{6}$`, rendered directly as the avatar's CSS background color on the client — loosening it would let an arbitrary string into a value the UI injects into `style`), `initials` (`min(1).max(2)`, a UI-integrity bound: the avatar bubble is sized for ≤ 2 chars), and `email` (`z.string().email().max(255)`). PATCH re-validates the full partial body, so the bounds apply on **both** write paths; there is no GET /:id, so round-trips read back via the owner's list. Malformed `color` (non-hex) **and** a plausible-but-wrong 3-digit `#fff` → 400 `VALIDATION_ERROR` naming `color` (the strict 6-hex bound has teeth, not just garbage-rejection); over-length `initials` (> 2) → 400 naming `initials`; malformed `email` → 400 naming `email`; a fully valid person round-trips (create → 201, reflected by the owner's list); a malformed `PATCH` (bad `color`) → 400 with the stored row left unmutated (no partial poison). **length/count-bounded task `tags` (#282):** the freshly-shipped tags feature (tags-v2 stats #278 + tag-autocomplete #281) stores a user-supplied, sync-carried, growth-prone array on every task as the `tags_json` column (copied into `completed_entries.tags_json` on completion), bounded **only** by the Zod contract — `TagSchema = z.string().trim().min(1).max(30)` (each tag ≤ 30 chars) + `z.array(TagSchema).max(20)` (≤ 20 tags/task) — with no body-size middleware, so those caps are the *only* thing keeping tag rows / sync payloads bounded. Because `TaskUpdateBodySchema = TaskCreateBodySchema.partial()` the bounds apply on **both** create and update: over-length tag (> 30) on create → 400 `VALIDATION_ERROR` naming `tags.0` (the per-tag length cap) **+ a normal create still 201 afterward** (recoverability); over-cap `tags` array (> 20) → 400 naming `tags` (the array-length cap); a valid `tags` array round-trips verbatim through `GET /v1/tasks/:id`; an over-length tag on `PATCH /v1/tasks/:id` → 400 with the stored tags left **unmutated** (no partial poison). unknown route → 404 |
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
- **2026-07-01 (#240 countdown `date` anchor)** — Follow-up to the #176 `remind_at`
  format-bound work, applied to the sibling scheduler/display-driving field. A countdown
  event's `date` is the solar (Gregorian) ISO anchor that **both** the "days until" math
  and the **lunar-recurrence** engine parse; its only bound is a strict date-only regex
  (`^\d{4}-\d{2}-\d{2}$`, on `CountdownBody` + the partial `CountdownUpdateBody`). The
  `countdowns` resource was reached by the daily DFX suite only via the #158 parametrized
  tenant-isolation + malformed-JSON cases — it had **no robustness coverage on `date`**. A
  regression that loosened the regex to `z.string()` (or dropped it) would let `"someday"` /
  a full-datetime string into the column display + recurrence later parse, surfacing only as
  a `NaN` "days until" or a crashing lunar conversion in prod, past every existing case.
  Closed with 4 cases over real HTTP + real SQLite: malformed `date` on create → 400
  `VALIDATION_ERROR` naming `date`; a full-datetime value (plausible but wrong shape) → 400
  naming `date` (the date-only bound has teeth, not just garbage-rejection); a valid `date`
  round-trips (create persists + owner's list reflects it — there is no GET /:id); malformed
  `date` on `PATCH` → 400 with the stored date left unmutated (no partial poison). Mutation-
  tested: loosening the regex to `z.string()` turns **exactly** the 3 bound-enforcing cases
  red (66/69) while the valid round-trip stays green — confirming teeth. Handler/contract
  verified already correct — **gap in the tests, not the code** (no production change).
- **2026-06-30 (#176 task reminders `remind_at`)** — Per-task reminders (#176) added a
  `tasks.remind_at` column that the reminder **scheduler** reads to decide when to fire a
  notification, yet the entire reminder surface had **zero** integration/DFX coverage. Its
  only safeguard is a strict local-wall-clock datetime regex (`YYYY-MM-DDTHH:MM(:SS)?`); a
  regression that loosened it to `z.string()` (or dropped it) would let `"tomorrow"` / a
  date-only string into the column the scheduler later parses — surfacing only as a
  mis-fired or scheduler-crashing reminder in prod, past every existing case. Closed with 4
  DFX **Robustness** cases over real HTTP + real SQLite: malformed `remind_at` on create →
  400 `VALIDATION_ERROR` (naming `remind_at`); a date-only value (no time) → 400 (proving
  the full-datetime bound has teeth, not just garbage-rejection); a valid value round-trips
  (create persists it, a read reflects it back — so the scheduler's input survives storage);
  and a malformed `PATCH` → 400 **with the stored value left unmutated** (no partial poison
  of the scheduler's input on the update path). Contract/handler verified already correct —
  **gap in the tests, not the code** (no production change).
- **2026-07-01 (#236 project-kind template payload)** — PR1 of the #211 V2 project-templates
  line (#233) turned `TemplateCreateBodySchema` into a `z.union` of a task variant and a **new
  project variant** (`ProjectTemplatePayloadSchema`). That project payload is a distinct
  JSON-column shape — the project's authored fields plus a bundle of task blueprints — with its
  own bounds: `content` ≤ 1 MB, `goals` ≤ 50 (each `goals[].text` ≤ 200), and **`tasks` ≤ 100**
  task blueprints (a bound **unique to project templates** — no direct-`/projects` analogue).
  With no body-size middleware, these Zod caps are the *only* bound on template row growth. The
  DFX suite reached `/v1/templates` only through the #158 tenant-isolation/malformed-JSON cases
  and the #184 **task**-kind `payload.duration` nested bound — the **project**-kind payload had
  zero robustness coverage. A regression loosening/dropping a cap, or 5xx'ing on an oversized
  project-template body instead of a clean 400, would slip past every existing case (sharpened by
  #222 inflating `content` and #235 instantiating project templates). Closed with 3 cases over
  real HTTP + real SQLite: over-cap `payload.content` → 400 `VALIDATION_ERROR` (naming
  `payload.content`) **+ a valid project template still creates → 201 afterwards**
  (recoverability + proof it was the cap, not the union structure, that rejected); over-length
  nested `payload.goals.0.text` → 400 (path asserted, validation reaches into the array element);
  over-cap **`payload.tasks`** array → 400 (naming `payload.tasks`). Each asserts the dotted
  `payload.*` path so the test has teeth — the *right* bound fired inside the union's project
  variant, not an incidental 400. Mutation-tested: loosening the `tasks` cap turns exactly that
  case red. Contract/handler verified already correct — **gap in the tests, not the code** (no
  production change).
- **2026-07-02 (#264 settings reminder-time format bounds)** — Audit of the live route
  surface vs this matrix found the **`settings`** resource had **no presence in the daily DFX
  suite at all** — no robustness, scalability, or isolation row (its enum + SSRF coverage lives
  only in the per-PR, in-process `api/settings.test.ts`, not over real HTTP + real file SQLite in
  the daily regression). The highest-value uncovered path is the format-bounded scheduler/display
  fields `morning_reminder_time` / `evening_reminder_time` on `PATCH /v1/settings`, gated **only**
  by a shape regex `^\d{2}:\d{2}$` — the exact sibling of the #176 `remind_at` / #240
  `countdowns.date` bounds. A regression loosening the regex to `z.string()` would let a malformed
  time (`"9am"`, `"9:5"`) into the column the client's reminder scheduler reads, past every existing
  daily case. Closed with 4 cases over real HTTP + real SQLite: malformed `morning_reminder_time` →
  400 `VALIDATION_ERROR` naming the field; single-digit `evening_reminder_time` (`"9:5"`, plausible
  near-miss) → 400 (proves the two-digit shape bound has teeth, not just garbage-rejection); valid
  `HH:MM` round-trips via `PATCH` then `GET`; malformed `PATCH` leaves the stored value unmutated (no
  partial poison). Mutation-tested: loosening the regex to `z.string()` turns **exactly** the 3
  bound-enforcing cases red (80/83) while the valid round-trip stays green — teeth confirmed.
  **Settings SSRF deliberately left off this daily layer** (documented in the Robustness row): the
  `ai_configs_update.baseUrl` private-IP guard early-returns in the daily harness's `local` dbMode
  (`allowPrivate=true`), so a daily private-IP case would be a false-green — it stays covered by the
  in-process api suite. Handler/contract verified already correct — **gap in the tests, not the code**
  (no production change). dfx 83 ✓.
- **2026-07-02 (#255 generic sync chokepoint)** — Every prior IDOR case targeted a *specific*
  REST resource/route. The **generic sync engine** (`POST /v1/sync/pull` + `/push`,
  `backend/src/sync/engine.ts`) — the single manifest-driven chokepoint that enforces cross-user
  isolation for **all seven syncable entities at once** (ADR-0004), with no per-entity branching —
  had **zero** integration/DFX coverage. It is the **highest-blast-radius** isolation surface in the
  app: one dropped `WHERE user_id` would leak or cross-write every tenant's rows across every entity
  simultaneously, and none of its three load-bearing invariants was pinned by a test. Closed with 6
  cases over real HTTP + real SQLite: **AC1** pull is tenant-scoped (Bob's pull never contains Alice's
  pushed row in any entity bucket; Alice's own pull does — positive control so it's not vacuously
  green); **AC2** push forces `user_id` from the JWT (a body-supplied `user_id` on Bob's push lands
  under Bob, never Alice); **AC3** the cross-user id-collision guard (Bob pushing a row whose `id`
  collides with Alice's, with a **strictly newer HLC** so LWW alone would apply, is a no-op — Alice's
  row survives unchanged and Bob does not acquire it); **AC4** validate-all-then-apply (one row failing
  the engine's per-entity schema → 400 `INVALID_ROW` with **nothing** from the batch applied; malformed
  JSON → 400 `INVALID_JSON`, not 5xx, on both push and pull); **AC5** unauthenticated pull/push → 401.
  Mutation-tested: dropping the pull `WHERE user_id`, the push `user_id` force, or the `ON CONFLICT …
  WHERE <table>.user_id = :uid` guard each reddens the isolation cases (the collision-guard mutation
  reddens **exactly** AC3 — perfect specificity; the other two entangle AC1/AC2/AC3 via the shared
  pull round-trip but always redden their target, and AC4/AC5 never falsely trip). Engine/route
  verified already correct — **gap in the tests, not the code** (no production change). dfx 79 ✓.
- **2026-07-02 (#267 habit check-in `date` format bounds)** — Last member of the scheduler/streak-driving
  format-bound family (#176 `remind_at` → #240 `countdowns.date` → #264 settings reminder-times). The
  `habits` resource was present in the daily DFX suite only via the #158 tenant-isolation + malformed-JSON
  cases and the #165 log-IDOR sweep — it had **no format-robustness coverage on its `date` field**. The
  check-in `date` is the key of every `habit_logs` row and the sole input to the client's **streak**
  computation, gated **only** by a strict date-only regex `^\d{4}-\d{2}-\d{2}$` on **two** surfaces: the
  `POST /:id/log` JSON body **and** the `DELETE /:id/log/:date` **path param**. The `DELETE` is the
  insidious one — it is idempotent (`204` on no-match), so a dropped param bound would slip a bad date into
  an unguarded `DELETE … WHERE date = :date` with **no status-code change**. A regression loosening either
  regex to `z.string()` would let `"someday"` / a full-datetime into the column the streak math parses, past
  every existing daily case. Closed with 4 cases over real HTTP + real SQLite: malformed `date` on
  `POST /:id/log` → 400 `VALIDATION_ERROR` naming `date` (no log written); a full-datetime `date`
  (`"2026-07-02T09:30"`, a valid `remind_at` but wrong shape here) → 400 naming `date` (the date-only bound
  has teeth, not just garbage-rejection); a valid `date` round-trips (`POST` → `201`, reflected by
  `GET /v1/habits/logs`); malformed `date` on the `DELETE` path param → 400 with a pre-existing valid
  check-in left intact (no partial poison). Mutation-tested with **perfect specificity**: loosening the
  POST-body regex reddens **exactly** the two POST cases, loosening the `LogParam` date regex reddens
  **exactly** the `DELETE` case, and the valid round-trip stays green under both. Handler regexes verified
  already correct — **gap in the tests, not the code** (no production change). dfx 87 ✓.
- **2026-07-03 (#279 `people` avatar field format/length bounds)** — Audit of the live route
  surface vs this matrix found the **`people`** resource present in the daily DFX suite only via
  the #158 tenant-isolation + malformed-JSON cases — **no format/bound robustness coverage on its
  own fields**, despite carrying three strictly-bounded, display-driving inputs whose *only* guard
  is a Zod format/length rule at the route boundary (`validate("json", PersonCreateBodySchema)`, and
  its partial on `PATCH`): `color` (`^#[0-9a-fA-F]{6}$`, rendered **directly as the avatar's CSS
  background color** — loosening it to `z.string()` would let an arbitrary string into a value the
  UI injects into `style`, a robustness + mild CSS-injection concern surfacing only in the rendered
  DOM), `initials` (`min(1).max(2)`, a UI-integrity bound — the avatar bubble is sized for ≤ 2 chars),
  and `email` (`z.string().email().max(255)`). Same class as the scheduler/format-bound family
  (#176 → #240 → #264 → #267), applied to the last user-scoped CRUD resource whose format bounds were
  untested at the daily real-HTTP + real-SQLite layer. Closed with 6 cases over real HTTP + real
  SQLite: malformed `color` (non-hex) → 400 `VALIDATION_ERROR` naming `color`; a plausible-but-wrong
  3-digit `#fff` → 400 naming `color` (the strict 6-hex bound has teeth, not just garbage-rejection);
  over-length `initials` (> 2) → 400 naming `initials`; malformed `email` → 400 naming `email`; a fully
  valid person round-trips (create → 201, reflected by the owner's list — no GET /:id); a malformed
  `PATCH` (bad `color`) → 400 with the stored row left unmutated (no partial poison). Mutation-tested
  with **perfect specificity**: loosening the `color` regex reddens **exactly** the 3 color cases,
  loosening the `initials` `.max(2)` reddens **exactly** the initials case, dropping `.email()` reddens
  **exactly** the email case, and the valid round-trip stays green under all three. Handler/contract
  verified already correct → **gap in the tests, not the code** (no production change). dfx 93 ✓.

- **2026-07-03 (#276 habits/migrate cross-tenant log-import)** — Test-gap audit found the bulk-import
  endpoint `POST /v1/habits/migrate` had **no presence in the daily DFX/integration suite at all** — it
  was exercised only by the per-PR in-process `api/habits.test.ts` (in-memory), so a passing PR CI was not
  proof of daily coverage. migrate writes into the **shared `habit_logs` keyspace** using a
  **client-supplied `habitId`** per log row, gated only by an ownership guard
  (`if (!ownedIds.has(l.habitId)) continue;`, `routes/habits.ts`): a dropped guard would let a caller smuggle
  log rows keyed to another tenant's habit id into their own scope (under their JWT `user_id`), polluting the
  shared key space with references to a habit they do not own. Added 1 DFX · Security case over real HTTP +
  real file SQLite: attacker bulk-imports one owned habit + two logs (one owned, one keyed to the victim's
  habit id) → `migrated.logs === 1` (foreign log dropped), the attacker's `GET /v1/habits/logs` contains
  their own migrated log (positive control, not vacuously green) but **never** a row keyed to the victim's
  habit id, and the victim's log space stays empty for that habit. **Mutation-tested with perfect specificity:**
  removing the ownership guard reddens **exactly** this case (94 → 93) and restoring returns 94/94. Handler
  guard verified already correct — **gap in the tests, not the code** (no production change). dfx 94 ✓.
- **2026-07-03 (#282 task `tags` array length/count bounds)** — Audit of a **freshly-shipped**
  feature: the tags surface landed via tags-v2 stats (#278) + tag-autocomplete (#281), but the daily
  DFX suite reached `/v1/tasks` only for tenant-isolation, malformed-JSON, and scalability — the
  `tags` bounds had **zero** robustness coverage. `tags` is a user-supplied, sync-carried, growth-prone
  array persisted on every task as the `tags_json` column (and copied into `completed_entries.tags_json`
  on completion), bounded **only** by the `@lumo/contracts` Zod contract: `TagSchema =
  z.string().trim().min(1).max(30)` (each tag ≤ 30 chars) + `z.array(TagSchema).max(20)` (≤ 20 tags/task).
  With **no body-size middleware**, those Zod caps are the *only* thing keeping tag rows / sync payloads
  bounded — same growth-prone profile as the #225 projects nested-payload audit. A regression loosening
  `TagSchema.max(30)` or the array `.max(20)` (or a 5xx on an oversized body instead of a clean 400)
  would let unbounded tag strings/arrays into the column and slip past every existing daily case,
  surfacing only as row/sync bloat in prod. Because `TaskUpdateBodySchema = TaskCreateBodySchema.partial()`
  the bounds apply on **both** write paths. Closed with 4 cases over real HTTP + real SQLite: over-length
  tag (> 30) on create → 400 `VALIDATION_ERROR` naming `tags.0` **+ a normal create still 201 afterward**
  (recoverability); over-cap `tags` array (> 20) → 400 naming `tags`; a valid `tags` array round-trips
  verbatim through `GET /v1/tasks/:id`; an over-length tag on `PATCH /v1/tasks/:id` → 400 with the stored
  tags left unmutated (no partial poison). Mutation-tested with **perfect specificity**: loosening
  `TagSchema.max(30)` reddens **exactly** the two per-tag-length cases (create + PATCH), dropping the
  array `.max(20)` reddens **exactly** the array-count case, and the round-trip stays green under both.
  Handler/contract verified already correct → **gap in the tests, not the code** (no production change).
  dfx 97 ✓.
