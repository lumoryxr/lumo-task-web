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
| **Design for Security** | No unauthorized access, no cross-tenant leakage, no injection, no weak credentials | missing token → 401; garbage/malformed bearer → 401; cross-tenant read/patch/delete → 404 (no leak); weak password rejected at registration; SQL-injection-shaped input stored as literal data (table survives). **Tenant isolation now exercised across all user-scoped CRUD resources** — `tasks` **+ `people` / `countdowns` / `habits` / `templates`**: attacker PATCH/DELETE of another tenant's row → 404 (owner's row survives & unmutated); attacker's list never contains the owner's row (#158; `templates` added 2026-06-29). **Plus the id-addressed state-changing sub-resource endpoints** (#165 + #190): cross-tenant `POST /completed/:id/reopen` → 404 (owner's entry not tombstoned); `POST /habits/:id/log` → 404 (no check-in written); `DELETE /habits/:id/log/:date` → 204 idempotent **but owner's check-in survives** (silent-IDOR guard); `POST /focus/sessions` with another tenant's `task_id` → 200 no-op **but owner's `pomos_done` unchanged & no completed entry leaked** (silent-IDOR guard — endpoint never 404s, so only state-survival catches it; #190). **And the `tasks` state-changing sub-resources** (#194): cross-tenant `POST /tasks/:id/complete` → 404 (owner's task stays open, no completed entry spawned under either tenant); `POST /tasks/:id/uncomplete` → 404 (owner's task stays completed, its entry survives). **Plus the caller-supplied-`taskId` AI surface** (#209): cross-tenant `POST /ai/breakdown` → 404 (no task content disclosed into the attacker's AI response, no cloud-quota burn against the owner's data); non-existent `taskId` → 404 `NOT_FOUND` (not 5xx), proving the scoped-load 404 fires before any provider/LLM call. **Plus the cross-RESOURCE foreign-key reference** (#220): a task may only reference a project the caller owns — `POST /tasks` and `PATCH /tasks/:id` with another tenant's `project_id` → **400 `INVALID_PROJECT`** (note: 400, a body-field validation, not the 404 the path-id IDOR cases use), with the task not created / its `project_id` left unmutated, and the own-project link still succeeding (teeth). **Plus the generic sync chokepoint** (`POST /v1/sync/pull` + `/push`, #255) — the single manifest-driven engine that scopes **all** syncable entities at once (highest blast radius): pull is tenant-scoped (Bob never pulls Alice's rows; positive control that Alice does); push forces `user_id` from the JWT (body-supplied `user_id` lands under the caller, never the victim); the cross-user id-collision guard makes Bob's push of a row colliding with Alice's id — with a **strictly-newer HLC** so LWW alone would apply — a no-op (Alice's row survives, Bob doesn't acquire it); unauthenticated pull/push → 401. Each isolation invariant mutation-tested (collision-guard mutation reddens exactly its case). **Plus the bulk-import log-ownership guard** (`POST /v1/habits/migrate`, #276) — migrate's *only* daily-suite presence: it writes the shared `habit_logs` keyspace with a client-supplied `habitId` per log, so a caller bulk-importing a log keyed to another tenant's habit id must have it **dropped** (`migrated.logs` counts only owned logs; the attacker's `GET /habits/logs` never gains a row for the foreign habit id; positive control that their own migrated log *is* imported). Mutation-tested (removing the ownership guard reddens exactly this case). **Plus the id-collision guard on the top-level bulk-import migrate endpoints** (`POST /v1/countdowns/migrate` + `POST /v1/projects/migrate`, #295) — the sibling of habits/migrate: both bulk-insert rows with a **client-supplied `id`** while forcing `user_id` from the JWT, into tables keyed on a **global `id TEXT PRIMARY KEY`**, so the *only* thing stopping a caller from clobbering another tenant's row by supplying its id is the statement's `INSERT OR IGNORE` conflict resolution (a colliding foreign id is silently skipped). Both handlers return `migrated: <submitted>.length` (the **submitted** count, not the inserted count), so status code + count are **blind** to an `INSERT OR IGNORE`→`INSERT OR REPLACE` regression that would let an attacker **steal** a victim's countdown/project by id (OR REPLACE rewrites the row's `user_id`). Only cross-tenant state-survival catches it (no GET /:id → read back via each owner's list): attacker's list gains their own import (positive control) but **never** the colliding foreign id; victim's row survives **unmutated** (original title/name, not the attacker's "STOLEN"). Each mutation-tested with perfect specificity (OR REPLACE on countdowns reddens exactly the countdowns case; on projects exactly the projects case). **Plus the last member of the migrate-family id-collision guard — the `habits` table ROW** (`POST /v1/habits/migrate`, #306): #276 covered only habits/migrate's *log*-ownership guard and #295 explicitly scoped itself to countdowns + projects, so the habit *row* id-collision was the one uncovered sibling. Same shape as #295 — `INSERT OR IGNORE INTO habits` with a client-supplied `id` into the global `habits(id)` primary key, and a `migrated.habits` count that reports the *submitted* length (blind to an `OR IGNORE`→`OR REPLACE` steal). One case over real HTTP + real SQLite (attacker imports one owned habit = positive control + one colliding on the victim's habit id with different content → attacker's `GET /v1/habits` gains the owned row but **never** the foreign id; victim's habit survives **unmutated**). Mutation-tested with perfect specificity (`OR IGNORE`→`OR REPLACE` on the habits INSERT reddens exactly this case, 100/101). **Plus the server-side task-search tenant scope** (`GET /v1/tasks?q=`, #234) — the search filter is a **distinct SQL builder** from the plain list (its own `LIKE ESCAPE` clause), so its tenant scope needs its own case: an intruder searching `?q=<owner's rare keyword>` surfaces **none** of the owner's tasks (no title/description leak via search), while the owner searching the same keyword **does** get their own (positive control — emptiness is scope, not a dead query). Mutation-tested (dropping the search path's `WHERE user_id` reddens exactly this case). **Plus AI-provider credential confidentiality on `/v1/settings`** (#260) — `PATCH /v1/settings` with `ai_configs_update.key` is the ONE place a user hands the backend a long-lived secret (their provider API key), and its confidentiality contract had no real-HTTP + real-file-SQLite coverage (settings' only prior daily presence is the #264 reminder-time robustness cases; the per-PR in-process `api/settings.test.ts` asserts `hasKey` shape but not at-rest ciphertext or full-body non-echo). Two load-bearing halves, each pinned at the layer where a real DB file exists to inspect: **(1) encrypted at rest** — a submitted key is stored `enc:v1:`-prefixed (AES-256-GCM via `encryptSecret`) in the `settings.ai_configs` JSON column and the plaintext sentinel is **absent** from that column (a DB/backup leak spills no usable keys); **(2) never echoed** — `rowToSettings` projects each provider config to `{ hasKey, model, baseUrl }`, so neither the plaintext key **nor its `enc:v1:` ciphertext** appears in the `PATCH` **or** `GET /v1/settings` response body (full-body substring scan against both forms + assert no `key` field on the provider config at all, only `hasKey:true`); plus a **conditional-write** case — a PATCH touching only a non-secret field (`model`) leaves the key `enc:v1:`-encrypted at rest and un-echoed (the handler's `if (key != null && key.trim())` guard doesn't wipe the key or round-trip it back to cleartext). Mutation-tested with perfect specificity: bypassing `encryptSecret` (store plaintext) reddens all 3 (the whole block hinges on at-rest ciphertext); adding `key` to the `rowToSettings` projection reddens **exactly** the two non-echo cases while the at-rest case stays green. **Plus the auth-token security core — `POST /v1/auth/refresh` rotation, single-use & reuse-detection** (#284): the refresh-token lifecycle (previously exercised only in-process) now has real-HTTP + real-file-SQLite coverage — a valid refresh rotates to a new single-use token whose old token is dead; **replaying a rotated token triggers the theft response** (the whole family is revoked via `revokeAllForUser`, so the legitimate successor token also dies); a garbage token → 401 (never 5xx) / a missing field → 400; a `/signout`-revoked token can't refresh; and a password change (session-version bump) strands outstanding tokens. Each guard mutation-tested with perfect specificity (family-revoke removal reddens exactly the successor-dies case; session-version guard removal reddens exactly the password-change case). **Plus the public calendar-feed capability** (`GET /v1/calendar/feed.ics`, #169): the app's **only** public, unauthenticated, token-as-capability endpoint — the opaque token IS the read capability for a user's open due-tasks + countdown events (the Google/Apple "secret iCal address" model), scoped `WHERE user_id = :uid` via the token → user **hash** lookup (`calendar_feed_token_hash`), a distinct non-JWT auth path that had no daily-suite presence (only the in-process `api/calendar.test.ts`). Three capability-security guarantees pinned over real HTTP + real file SQLite: **(1) capability isolation** — Alice's feed (fetched by her token) contains her own task and **not** Bob's, and vice-versa (positive controls both ways — emptiness alone would be a false-green); **(2) anti-enumeration / non-confirmation** — a **missing** token and an **unknown/garbage** token both → the **same** `404` (never a 401-vs-404 validity oracle), while a valid token → `200 text/calendar` (positive control); **(3) rotation = revocation** — after `POST /v1/calendar/feed/rotate` the **old** token → `404` (capability revoked) and the **new** token → `200`. Mutation-tested: dropping the feed's `WHERE user_id` scoping reddens exactly the isolation case; a rotate that skips the hash overwrite reddens exactly the revocation case; the shared `!user` 404 guard (missing/unknown/revoked all route through it) is confirmed the load-bearing gate. **Plus the profile stats aggregate** (`GET /v1/user`, #390): the app's **only user-facing cross-tenant _aggregate_** — the profile response carries `stats.tasks` (`COUNT(CASE WHEN completed = 0 …)`, open tasks) + `stats.pomodoros` (`SUM(pomos_done)`) computed `WHERE user_id = :uid AND deleted_at IS NULL`, so a dropped scope silently folds another tenant's counts into the caller's profile with **no status-code change** (still 200). Three cases over real HTTP + real file SQLite with fresh dedicated actors (owner: 3 open + 1 completed task, 2 pomodoros; other tenant: different non-zero 5 / 3): **authN** (no token / garbage bearer → 401 never 500, valid → 200); **profile identity** (response email/name/id are the token-owner's — row loaded from the JWT); **aggregate scope** — owner's `stats.tasks` is **exactly 3** (excludes the completed task *and* the other tenant's 5) and `stats.pomodoros` **exactly 2** (never the other tenant's 3), with the other tenant's own 5/3 view as a positive control. Mutation-tested with perfect specificity: dropping `WHERE user_id` reddens exactly the aggregate case; `COUNT(CASE WHEN completed = 0 …)` → `COUNT(*)` also reddens exactly it (open-only predicate has its own teeth) |
| **Design for Robustness** | Malformed / wrong-typed / missing input degrades to 4xx, never a 5xx crash | malformed JSON body → 400 `INVALID_JSON` (proven a **global** handler — exercised on `tasks` + `people` / `countdowns` / `habits` / `templates`, #158); missing required field → 400; wrong field type → 400; out-of-enum value → 400; **nested-payload violation (templates `payload.duration` out of range) → 400** (validation reaches into the JSON payload column, #184); **bounded project-kind template payload (#236, project-templates PR1 #233):** the new `z.union` project variant carries its own JSON-column bounds (`payload.content` ≤ 1 MB, `payload.goals` ≤ 50 / `goals[].text` ≤ 200, and **`payload.tasks` ≤ 100** task blueprints — a bound *unique* to project templates) with no body-size middleware, so those Zod caps are the only bound on template row growth — over-cap `payload.content`, over-length `payload.goals.0.text`, and over-cap `payload.tasks` array all → 400 `VALIDATION_ERROR` naming the offending dotted `payload.*` path (proving the right bound fired inside the union's project variant), the over-cap `content` case pairing the rejection with a valid project-template create → 201 (recoverability + proof it was the cap, not the union structure, that rejected); **bounded nested payload on `projects` (#213/#219):** over-cap `content` (> 1 MB row-size cap), over-length nested goal (`goals[].text` > 200, validation reaches into the array element), and over-cap `goals` array (> 50) all → 400 `VALIDATION_ERROR` naming the offending dotted field — there is **no body-size middleware**, so the Zod caps are the only bound on row growth; an over-cap body still degrades to a clean 400 (not 5xx) and leaves the server healthy; **format-bounded `tasks.remind_at` (#176):** the scheduler-driving reminder field is gated only by a wall-clock datetime regex — malformed (`"tomorrow"`) and plausible-but-incomplete (date-only, no time) values → 400 `VALIDATION_ERROR` naming `remind_at` on **both** create and update, a valid value round-trips through storage, and a rejected `PATCH` leaves the stored value unmutated (no partial poison of the scheduler's input); **format-bounded `countdowns.date` (#240):** the solar ISO anchor that the "days until" math **and** the lunar-recurrence engine parse is gated only by a strict date-only regex (`^\d{4}-\d{2}-\d{2}$` on both create + partial update) — garbage (`"someday"`) **and** a plausible-but-wrong full-datetime (`2026-07-01T09:30`, a valid `remind_at` shape) → 400 `VALIDATION_ERROR` naming `date` on **both** create and update, a valid value round-trips through storage (verified via the owner's list — no GET /:id), and a rejected `PATCH` leaves the stored date unmutated; **format-bounded settings reminder times (#264):** `morning_reminder_time` / `evening_reminder_time` on `PATCH /v1/settings` — the `HH:MM` anchors stored verbatim and returned by `GET /v1/settings` to drive the client's morning/evening reminder scheduling — are gated only by a shape regex `^\d{2}:\d{2}$` (nullable/optional), settings' *only* presence in this daily suite; malformed (`"9am"`) **and** a single-digit near-miss (`"9:5"`, plausible but violating the two-digit shape) → 400 `VALIDATION_ERROR` naming the field, a valid `HH:MM` round-trips through `GET`, and a rejected `PATCH` leaves the stored value unmutated (no partial poison of the scheduler's input). **Note — settings SSRF is intentionally NOT at this daily layer:** the `ai_configs_update.baseUrl` private-IP SSRF guard stays covered by the in-process `api/settings.test.ts`; in the daily harness `dbMode()` is `local`, so `assertSafeOutboundUrl(raw, allowPrivate=true)` early-returns before the private-IP block, which would make a daily private-IP case a false-green — so it is deliberately omitted here rather than added misleadingly. **format-bounded habit check-in `date` (#267):** the key of every `habit_logs` row and the sole input to the client's streak computation, gated **only** by a strict date-only regex `^\d{4}-\d{2}-\d{2}$` on **two** surfaces — the `POST /:id/log` JSON body **and** the `DELETE /:id/log/:date` **path param**. The DELETE is the insidious surface: it is idempotent (`204` on no-match), so a dropped param bound would slip a bad date into an unguarded `DELETE … WHERE date = :date` with no status-code change. Malformed (`"someday"`) **and** a plausible-but-wrong full-datetime (`"2026-07-02T09:30"`, a valid `remind_at` shape) → 400 `VALIDATION_ERROR` naming `date` on the POST body; a valid `date` round-trips (`POST` → `201`, reflected by `GET /v1/habits/logs`); a malformed `date` on the `DELETE` path param → 400 with a pre-existing valid check-in left intact (no partial poison — the idempotent delete never runs on a bad date). **format/length-bounded `people` avatar fields (#279):** the `people` resource's three display-driving inputs are each gated **only** by a Zod format/length rule at the route boundary — `color` (`^#[0-9a-fA-F]{6}$`, rendered directly as the avatar's CSS background color on the client — loosening it would let an arbitrary string into a value the UI injects into `style`), `initials` (`min(1).max(2)`, a UI-integrity bound: the avatar bubble is sized for ≤ 2 chars), and `email` (`z.string().email().max(255)`). PATCH re-validates the full partial body, so the bounds apply on **both** write paths; there is no GET /:id, so round-trips read back via the owner's list. Malformed `color` (non-hex) **and** a plausible-but-wrong 3-digit `#fff` → 400 `VALIDATION_ERROR` naming `color` (the strict 6-hex bound has teeth, not just garbage-rejection); over-length `initials` (> 2) → 400 naming `initials`; malformed `email` → 400 naming `email`; a fully valid person round-trips (create → 201, reflected by the owner's list); a malformed `PATCH` (bad `color`) → 400 with the stored row left unmutated (no partial poison). **length/count-bounded task `tags` (#282):** the freshly-shipped tags feature (tags-v2 stats #278 + tag-autocomplete #281) stores a user-supplied, sync-carried, growth-prone array on every task as the `tags_json` column (copied into `completed_entries.tags_json` on completion), bounded **only** by the Zod contract — `TagSchema = z.string().trim().min(1).max(30)` (each tag ≤ 30 chars) + `z.array(TagSchema).max(20)` (≤ 20 tags/task) — with no body-size middleware, so those caps are the *only* thing keeping tag rows / sync payloads bounded. Because `TaskUpdateBodySchema = TaskCreateBodySchema.partial()` the bounds apply on **both** create and update: over-length tag (> 30) on create → 400 `VALIDATION_ERROR` naming `tags.0` (the per-tag length cap) **+ a normal create still 201 afterward** (recoverability); over-cap `tags` array (> 20) → 400 naming `tags` (the array-length cap); a valid `tags` array round-trips verbatim through `GET /v1/tasks/:id`; an over-length tag on `PATCH /v1/tasks/:id` → 400 with the stored tags left **unmutated** (no partial poison). **bounded `/v1/ai/chat` request payload (#320):** the app's highest-volume LLM entry point (pet PetChat) has **no body-size middleware**, so the `ChatBody` Zod caps — `messages` array ≤ 20 + each message `content` ≤ 5000 chars — are the *sole* guard against unbounded LLM-prompt payload growth (cost / prompt-injection-surface / memory amplification). `validate("json", …)` runs before the handler, so rejections are exercised with **no AI provider** configured; the valid case takes the deterministic no-key fallback (`tryParseIntent` → null → `fallbackReply`) → 200 `fallback:true`. Over-cap `messages` (> 20) → 400 `VALIDATION_ERROR` naming `messages`; over-length `content` (> 5000) → 400 naming `messages.0.content` **+ a normal chat still 200 afterward** (recoverability); a valid small body → 200 `fallback:true` with a non-empty reply; a body **exactly at both caps** (20 messages / 5000-char content) is still accepted → 200 (proving the caps sit at 20/5000, not below). **bounded `/v1/ai/parse` NL-capture input (#305):** the natural-language quick-capture endpoint (sibling of the IDOR-covered `/ai/breakdown` #209 / `/ai/classify` #249, and the foundation of the Phase-3 NL+AI-planning proposal) validates its body via `validate("json", ParseBody)` **before** any LLM call, with two load-bearing bounds — `text: z.string().min(1).max(500)` (the free text injected verbatim into the prompt; `max(500)` is the *only* bound on how much attacker-controlled text reaches the model, `min(1)` rejects an empty capture) and `locale: z.enum(["en","zh"]).optional()`. Because `/ai/parse` has a graceful no-LLM fallback (no provider configured → a *valid* request returns 200 with a deterministic `{ title: text.trim(), quadrant:"unclassified", confidence:0 }`) **both** the 400 (bad input) and 200 (valid input degrades gracefully, never a 5xx) paths are verifiable with no AI provider: over-cap `text` (> 500) → 400 `VALIDATION_ERROR` naming `text`; empty `text` (`""`) → 400 naming `text` (the `min(1)` lower bound); out-of-enum `locale` (`"fr"`) → 400 naming `locale`; a valid `text` → 200 fallback (`quadrant:"unclassified"`, title echoes the trimmed input, `confidence:0`). Mutation-tested with **perfect specificity**: loosening `text` to `z.string()` reddens **exactly** the two `text` cases (locale + fallback green); loosening the `locale` enum reddens **exactly** the `locale` case (text + fallback green). **bounded OKR/KPI goal fields on `/v1/projects` (#304):** #290/#291 grew each project goal into an OKR Key Result — `target`/`current`/`start` (`z.number().finite().nonnegative()`), `unit` (`z.string().max(12)`), `confidence` (enum) — user-supplied, sync-carried, stored in `goals_json` with no body-size middleware, so the Zod field bounds are the only guard (the #213/#219 block covered only a goal's `text` / the `goals` array / `content`). Over-length `unit` (> 12), negative `target`, and out-of-enum `confidence` each → 400 `VALIDATION_ERROR` naming the offending dotted `goals.0.<field>` (proving the right bound fired inside the goal element, not an incidental 400); a fully-valid KR (start/current/target/unit/confidence) round-trips **verbatim** through the owner's list; and because `ProjectUpdateBody = ProjectBody.partial()` re-validates goals on PATCH, an over-length `unit` on `PATCH` → 400 with the stored KR left **unmutated** (no partial poison of a baseline the client renders). **format-bounded task `due` + `scheduled_start` temporal anchors (#319):** the two remaining format-bounded temporal fields on the task write boundary (siblings of `remind_at`, #176) had **zero** daily robustness coverage — `due` (#177) is the **strict date-only** ISO anchor (`^\d{4}-\d{2}-\d{2}$`) driving due-date display/sorting + planned due reminders; `scheduled_start` is the **wall-clock datetime** slot anchor (`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$`, same shape as `remind_at`) placing a task on the day plan. Both bind on create + partial update with no body-level coercion, so the Zod regex is the *only* barrier before storage. For **each** field: a malformed value (`"tomorrow"` / `"someday"`) **and** a plausible-but-wrong-shape value (a full datetime where `due` needs a date; a date-only where `scheduled_start` needs a time) → 400 `VALIDATION_ERROR` naming the field on **both** create and update (proving the *specific* format bound fired, not an incidental 400), a valid value round-trips through storage (`GET /v1/tasks/:id`), and a rejected `PATCH` leaves the stored value **unmutated** (no partial poison). Mutation-tested with **perfect specificity**: loosening `due`'s regex to `z.string()` reddens **exactly** `due`'s three bound-enforcing cases (round-trip green, no `scheduled_start` case affected) and vice-versa. **wildcard-escaped task search (`GET /v1/tasks?q=`, #234):** the search builder escapes user-supplied LIKE wildcards (`% _ \`) to literals so `?q=` matches text, not patterns — a literal `?q=%` returns only tasks that literally contain `%` (**not** the whole tenant list — a non-`%` task is excluded + every hit literally contains `%`), and a literal `?q=c_t` matches the literal `c_t` task but **not** `cat`/`cot` (the `_` is not a single-char wildcard). Over real HTTP + real file SQLite (the in-process `api/tasks.test.ts` wildcard test never ran in the daily regression); mutation-tested (dropping the escape reddens exactly these two cases). **bounded calendar-aware planning input `context.calendarBusyHours` (#172 V2):** the hours booked in the client's imported calendar, threaded into `generate_today_plan` to shrink the day's time budget, are bounded `z.number().nonnegative().max(24)` on the `/v1/ai/chat` context so a malformed client value can't distort planning — out-of-range (`-1`, `25`) → 400 `VALIDATION_ERROR` naming `context.calendarBusyHours`, an in-range value (`3`) → 200 (no-key fallback). **bounded `/v1/ai/chat` context nested payloads (#380):** sibling to #320 (which pinned `messages`/`content`) — `ChatBody.context` carries the two largest *client-supplied* nested payloads injected into the LLM prompt, `todayTasks` (array `.max(50)`, each `title.max(500)` / `quadrant.max(20)`; up to 50×500 chars of task titles) and `recentCompleted` (array `.max(20)`, each `title.max(500)`), with **no body-size middleware** so these Zod caps are the *sole* bound on how much task data floods the prompt (cost / prompt-injection-surface / memory amplification). Over-cap `context.todayTasks` (51) → 400 naming `context.todayTasks`; over-length `context.todayTasks.0.title` (> 500) → 400 naming the dotted path **+ a normal chat still 200 afterward** (recoverability); over-cap `context.recentCompleted` (21) → 400 naming `context.recentCompleted`; a body **exactly at both caps** (50 todayTasks / 20 recentCompleted, all valid) → 200 `fallback:true` (caps sit at 50/20, not below). Mutation-tested with **perfect specificity**: loosening the `todayTasks` array cap reddens exactly the over-cap-array case, the per-title cap reddens exactly the over-title case, the `recentCompleted` cap reddens exactly its case — the at-boundary case stays green throughout. **auth register/signin input bounds (#387):** `POST /v1/auth/register` and `POST /v1/auth/signin` are the app's two public, unauthenticated, highest-traffic endpoints, yet the daily suite exercised them only as the `registerUser` fixture (the sole input case was the "weak password rejected at registration" security assertion) — `register` never had its `email` shape / `name` length bounds pinned and `signin` had **zero** validation coverage. Each body is gated by a Zod schema (`RegisterBody`/`SigninBody`, `routes/auth.ts`) run via `validate("json", …)` **before** the handler touches the `users` table or spends bcrypt time, so those caps are the only barrier stopping a malformed row from reaching storage. `register`: malformed `email` (`"not-an-email"`) → 400 `VALIDATION_ERROR` naming `email` **+ a well-formed register right after → 201 with a token** (recoverability + proof it was the shape, not a dead endpoint); over-length `name` (> 100) → 400 naming `name` (the `max(100)` cap); empty `name` (`""`) → 400 naming `name` (the `min(1)` lower bound, distinct teeth from the max). `signin`: malformed `email` → **400** naming `email` (signin's own `.email()` shape gate) — deliberately asserted as 400, **not** the 401 credential path, pinning that validation fires before any credential/enumeration logic (orthogonal to the uniform-401 account-enumeration policy for *valid-but-unknown* emails, which is an open Jalen decision). Mutation-tested with **perfect specificity**: dropping `RegisterBody.email`'s `.email()` reddens exactly the register-email case; dropping `name`'s `.max(100)` / `.min(1)` reddens exactly the over-length / empty-name case; loosening `SigninBody.email`'s `.email()` reddens exactly the signin case (it falls through to the no-user 401). Handler/schemas already correct → **gap in the tests, not the code**; test+docs only. unknown route → 404 |
| **Design for Recoverability** | A bad request never poisons the server; the next request still works | invalid pagination cursor → 400 `INVALID_CURSOR`; burst of bad requests followed by a healthy request → 200; operation on non-existent id → 404 |
| **Design for Reliability** | Cross-resource writes stay referentially consistent; a cascade fires precisely, without dangling references or write amplification | **person-delete → `tasks.assignee_ids` cascade (#263):** `DELETE /v1/people/:id` is the app's **only** cross-resource cascade — after tombstoning the person it rewrites `tasks.assignee_ids` via `json_each`, scoped `WHERE user_id = :uid AND EXISTS(SELECT 1 FROM json_each(assignee_ids) WHERE value = :pid)`. Deleting a person drops its id from **every** referencing task while **retaining** co-assignees (partial removal, not a blanket array clear) and leaving tasks that never referenced it untouched (AC1); the rewrite is **precise** — a referencing task's `updated_at` (the LWW/cursor key) advances while an unrelated task's is byte-for-byte unchanged, proving the `EXISTS(... = :pid)` predicate scopes the write and there is no tenant-wide write amplification (AC2). Both over real HTTP + real file SQLite (tasks have no GET /:id → rows read back via the owner's list). Mutation-tested with **perfect specificity**: neutering the cascade's drop predicate (`value != :pid` → `1=1`) reddens **exactly** AC1 (co-assignee kept, deleted id not dropped) with AC2 green; dropping the `EXISTS(... = :pid)` predicate reddens **exactly** AC2 (the unrelated task's `updated_at` bumps) with AC1 green. Handler verified already correct → **gap in the tests, not the code** (no production change) |
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
- **2026-07-04 (#295 migrate id-collision guard on countdowns + projects)** — Sibling to the #276
  habits/migrate audit. `POST /v1/countdowns/migrate` and `POST /v1/projects/migrate` are the two
  top-level bulk-import endpoints that had **no presence in the daily regression at all** (exercised
  only by the per-PR in-process api suites, in-memory). Both `INSERT` rows with a **client-supplied
  `id`** while forcing `user_id` from the JWT, into tables keyed on a **global `id TEXT PRIMARY KEY`**
  (not composite with `user_id`) — so the *only* barrier stopping a caller from clobbering another
  tenant's row by supplying its id is each statement's `INSERT OR IGNORE` conflict resolution. The
  insidious part: both handlers return `migrated: <submitted>.length` (the **submitted** count, not
  the inserted count), so the 200 status **and** the count are **blind** to an `INSERT OR IGNORE`→
  `INSERT OR REPLACE` regression (an easy "overwrite on re-import" refactor) — OR REPLACE rewrites the
  row's `user_id` to the attacker's, letting them **steal** a victim's countdown/project by id. Only a
  cross-tenant state-survival assertion catches it, and neither resource has a GET /:id, so the check
  reads back via each owner's list. Closed with 2 cases over real HTTP + real SQLite (one per endpoint):
  attacker imports one owned row (positive control — the negative assertion is not vacuously green) plus
  one colliding on the victim's id with different content → attacker's list gains the owned row but
  **never** the colliding foreign id, and the victim's row survives **unmutated** (original title/name,
  not the attacker's "STOLEN"). Mutation-tested with **perfect specificity**: `INSERT OR IGNORE`→`OR
  REPLACE` on countdowns reddens **exactly** the countdowns case (projects stays green) and vice-versa.
  Both handlers verified already correct → **gap in the tests, not the code** (no production change).
  dfx 99 → 100.
- **2026-07-04 (#306 migrate id-collision guard on the habits ROW)** — The last uncovered member of
  the migrate-family id-collision guard. #276 covered only habits/migrate's **log-ownership** guard
  (a log referencing another tenant's habit id is dropped), and #295 **explicitly scoped itself to
  countdowns + projects** (its docstring even names itself "the sibling of habits/migrate"), so the
  `habits` **table row** id-collision was never exercised. Same shape as its #295 siblings:
  `POST /v1/habits/migrate` runs `INSERT OR IGNORE INTO habits` with a **client-supplied `id`** while
  forcing `user_id` from the JWT, into the global `habits(id TEXT PRIMARY KEY)`; the handler returns
  `migrated: { habits: <submitted>.length, … }` (the **submitted** count), so the 200 + count are
  **blind** to an `INSERT OR IGNORE`→`INSERT OR REPLACE` regression that would let an attacker **steal**
  a victim's habit by id (OR REPLACE rewrites the row's `user_id`). Only cross-tenant state-survival
  catches it — no GET /:id, so read back via each owner's `GET /v1/habits` list. Closed with 1 case
  over real HTTP + real SQLite: attacker imports one owned habit (positive control) + one colliding on
  the victim's habit id with different content → attacker's list gains the owned row but **never** the
  foreign id, and the victim's habit survives **unmutated** (original title, not the attacker's
  "STOLEN"). Mutation-tested with **perfect specificity**: `INSERT OR IGNORE`→`OR REPLACE` on the
  habits INSERT reddens **exactly** this case (100/101), restored → 101/101. Handler verified already
  correct → **gap in the tests, not the code** (no production change). dfx 100 → 101. **Note — the
  migrate arrays have no `.max()` length bound** (unbounded bulk-write); that is a *separate* Phase-2
  scalability concern flagged to Jalen, deliberately out of scope for this test-only audit.
- **2026-07-05 (#320 `/v1/ai/chat` request-payload bounds)** — Robustness audit of the app's
  highest-volume LLM entry point (pet PetChat). The daily DFX suite reached the `/v1/ai` surface only
  for **IDOR** (`/ai/breakdown` #209, `/ai/classify` #249); the **chat** endpoint's **request-payload
  bounds** had **zero** coverage. With **no body-size middleware**, the `ChatBody` Zod caps —
  `messages: z.array(…).max(20)` + each message `content: z.string().max(5000)` — are the *only* guard
  against unbounded LLM-prompt payload growth (a cost / prompt-injection-surface / memory amplification
  vector); a regression loosening either cap, or a 5xx on an oversized body instead of a clean 400,
  would slip past every existing case and surface only as inflated LLM cost/latency in prod. Because
  `validate("json", ChatBody)` runs as middleware **before** the handler, every rejection case is fully
  testable with **no AI provider** configured (no LLM/network dependency); the valid case takes the
  deterministic no-key fallback (`tryParseIntent` → null → `fallbackReply`) → 200 `fallback:true`.
  Closed with 4 cases over real HTTP + real SQLite: over-cap `messages` (> 20) → 400 `VALIDATION_ERROR`
  naming `messages`; over-length `content` (> 5000) → 400 naming `messages.0.content` **+ a normal chat
  still 200 afterward** (recoverability); a valid small body → 200 `fallback:true` with a non-empty
  reply; a body **exactly at both caps** (20 messages / 5000-char content) still 200 (the caps sit at
  20/5000, not below). Mutation-tested with **perfect specificity**: loosening `.max(20)`→`.max(21)`
  reddens **exactly** the array-cap case, `content.max(5000)`→`max(5001)` reddens **exactly** the
  content-length case, and the valid + at-boundary cases stay green under both. Contract/handler verified
  already correct → **gap in the tests, not the code** (no production change). dfx 101 → 105.
- **2026-07-06 (#319 task `due` + `scheduled_start` format bounds)** — Completes the task write
  boundary's temporal-field robustness family (sibling of `remind_at`, #176). The task write body carries
  **three** format-bounded temporal fields, but the daily DFX suite exercised only `remind_at`. The other
  two anchor core product behavior with **no daily real-HTTP + real-SQLite robustness coverage**: `due`
  (#177) — the **strict date-only** ISO anchor `^\d{4}-\d{2}-\d{2}$` driving due-date display/sorting +
  planned due reminders (had only a fast in-process contract unit test + a happy-path api test); and
  `scheduled_start` — the day-plan slot, a **wall-clock datetime** anchor
  `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$` (same shape as `remind_at`) placing a task on the schedule
  (had **zero** format-bound coverage anywhere). Both bind on **create and update**
  (`TaskUpdateBodySchema = TaskCreateBodySchema.partial()`) with no body-level coercion, so the Zod regex
  is the *only* barrier between a junk value and the storage column; a regression loosening either to
  `z.string()` would let a bad value land and slip past every existing case, surfacing only as a mis-sorted
  due list or a task the day-plan scheduler can't place. Closed with **8 cases** over real HTTP + real
  SQLite (4 per field): a malformed value on create → 400 `VALIDATION_ERROR` naming the field; a
  **plausible-but-wrong-shape** value (a full datetime for date-only `due`; a date-only for datetime
  `scheduled_start`) → 400 naming the field (proving the *specific* bound fired, not an incidental 400); a
  valid value round-trips through storage (`GET /v1/tasks/:id`); a malformed `PATCH` → 400 with the stored
  value left **unmutated** (no partial poison). Mutation-tested with **perfect specificity**: loosening
  `due`'s regex to `z.string()` reddens **exactly** `due`'s three bound-enforcing cases (round-trip green,
  no `scheduled_start` case affected), and loosening `scheduled_start`'s regex reddens **exactly** its
  three (round-trip green, no `due` case affected). Contract/handlers verified already correct → **gap in
  the tests, not the code** (no production change). dfx 109 → 117.
- **2026-07-06 (#234 server-side task search `GET /v1/tasks?q=`)** — The M1 search feature is a
  **distinct SQL builder** from the plain task list: it appends its own `LIKE :q ESCAPE '\'` clause over
  `title`/`desc` in **both** locales and escapes user-supplied LIKE wildcards (`% _ \`) to literals
  (`routes/tasks.ts:120-124`). Yet the daily suite exercised the plain list + cursor pagination but
  **never** this branch, leaving two failure modes uncovered — (1) **Security/IDOR:** a dropped
  `WHERE user_id` on this separate builder would leak another tenant's task **titles/descriptions** via
  `?q=` (info-disclosure; the existing isolation cases only exercise CRUD-by-id + the plain list); (2)
  **Robustness:** a dropped wildcard-escape would turn a user's `%`/`_` into SQL wildcards
  (`?q=%` → "return everything", defeating the filter / dumping the tenant's whole list). The in-process
  `api/tasks.test.ts` has a wildcard unit test, but the DFX mandate is real-HTTP + real-file-SQLite in
  the daily regression, which never touched search. Closed with **3 cases** over real HTTP + real SQLite:
  **AC1 (Security)** — an intruder searching `?q=<owner's rare keyword>` gets **none** of the owner's
  tasks while the owner searching the same keyword **does** get their own (the intruder even holds a task
  with the same keyword, so the emptiness is *scope*, not a dead query); **AC2 (Robustness)** — literal
  `?q=%` returns only tasks that literally contain `%`, **not** the full tenant list (a non-`%` task is
  excluded + every hit literally contains `%`); **AC3 (Robustness)** — literal `?q=c_t` matches the
  literal `c_t` task but **not** `cat`/`cot` (the `_` is escaped, not a single-char wildcard).
  Mutation-tested: dropping the wildcard-escape (`params.q = \`%${q}%\``) reddens **exactly** AC2 + AC3
  (AC1 green); dropping the search path's tenant scope (`WHERE user_id`) reddens AC1 (AC2/AC3 green).
  Handler verified already scoped + escaped → **gap in the tests, not the code** (no production change).
  dfx 117 → 120.

- **2026-07-06 (#263 person-delete → `tasks.assignee_ids` cascade)** — Test-gap audit of the app's
  **only cross-resource cascade**. `DELETE /v1/people/:id` (`routes/people.ts:132-167`) tombstones the
  person and then rewrites `tasks.assignee_ids`, dropping the deleted id from every referencing task via
  `json_each`, scoped `WHERE user_id = :uid AND EXISTS(SELECT 1 FROM json_each(assignee_ids) WHERE
  value = :pid)`. The daily suite reached `/v1/people` only through the #158 tenant-isolation +
  malformed-JSON cases and the #279 avatar-field bounds — those pin the person **row**, but **nothing**
  pinned the cascade itself. Two regressions would have been invisible to every existing case: (1)
  neutering the cascade (leaving the deleted id on the array) → **dangling assignee references** the UI
  would try to render; (2) dropping the `EXISTS(... = :pid)` predicate → the rewrite fires against
  **every** task in the tenant → **write amplification** + spurious `updated_at`/HLC churn on unrelated
  rows (needless sync traffic, LWW noise). This is a **Design-for-Reliability** (cross-resource
  referential consistency) dimension that had **zero** coverage — a new matrix row. Closed with **2
  cases** over real HTTP + real file SQLite (tasks have no GET /:id → rows read back via the owner's
  list): **AC1** — deleting a person drops its id from the referencing task while **retaining** a
  co-assignee (partial removal, not a blanket clear) and leaves a task that never referenced it whole;
  **AC2** — the referencing task's `updated_at` advances while an **unrelated** task's is byte-for-byte
  unchanged (the `EXISTS` predicate scopes the write — no amplification). Mutation-tested with **perfect
  specificity**: neutering the drop predicate (`value != :pid` → `1=1`) reddens **exactly** AC1 (AC2
  green); dropping the `EXISTS(... = :pid)` predicate reddens **exactly** AC2 (AC1 green); restored →
  both green. Handler verified already correct → **gap in the tests, not the code** (no production
  change). dfx 120 → 122.

- **2026-07-06 (#260 `/v1/settings` AI-provider credential confidentiality)** — Test-gap audit of the
  **one endpoint where a user hands the backend a long-lived secret**: `PATCH /v1/settings` with
  `ai_configs_update.key` (their OpenAI/DeepSeek/Claude/custom provider API key). Its confidentiality
  contract has two load-bearing halves — **(1) encrypted at rest**: the key is stored `enc:v1:`-encrypted
  (AES-256-GCM via `encryptSecret`, `routes/settings.ts:150`) in the `settings.ai_configs` JSON column,
  never plaintext; **(2) never echoed**: `rowToSettings` (`routes/settings.ts:62-70`) projects each
  provider config down to `{ hasKey, model, baseUrl }`, so the key value — plaintext **or** its `enc:v1:`
  ciphertext — is returned by neither `PATCH` nor `GET /v1/settings`. Settings' only prior presence in
  this daily suite was the #264 reminder-time robustness cases; the secret-handling contract (the whole
  reason the column is JSON-with-an-encrypted-field rather than a plain value) had **no** real-HTTP +
  real-file-SQLite coverage. Two regressions would have shipped silently: dropping the `encryptSecret`
  wrap (store the key in cleartext → a DB/backup leak spills usable keys) or surfacing the key in
  `rowToSettings` (echo it to any authenticated GET). The per-PR in-process `api/settings.test.ts`
  asserts the `hasKey` shape but not at-rest ciphertext or full-body non-echo. Closed with **3 cases**
  over real HTTP + real file SQLite (the raw `ai_configs` column read back via `queryOne` on the shared
  db client): **AC1 (at rest)** — a submitted key is stored `enc:v1:`-prefixed and the plaintext sentinel
  is absent from the column; **AC2 (never echoed)** — a full-body substring scan proves neither the
  plaintext key nor its stored ciphertext appears in the `PATCH` **or** `GET` response, and the provider
  config carries no `key` field at all (only `hasKey:true`); **AC3 (conditional-write)** — a PATCH
  touching only `model` leaves the key `enc:v1:`-encrypted at rest and un-echoed (the handler's
  `if (key != null && key.trim())` guard neither wipes the key nor round-trips it back to cleartext).
  Mutation-tested with **perfect specificity**: bypassing `encryptSecret` (store plaintext) reddens all 3
  (the block hinges on at-rest ciphertext); adding `key` to the `rowToSettings` projection reddens
  **exactly** AC2 + AC3 while AC1 stays green. Handler/crypto verified already correct → **gap in the
  tests, not the code** (test + docs only, no production change). dfx 122 → 125.

- **2026-07-07 (#305 `/v1/ai/parse` NL-capture input bounds)** — Robustness audit of the
  natural-language quick-capture endpoint ("type a task in plain English"), foundation of the Phase-3
  NL+AI-planning proposal. Sibling AI surfaces are covered for **IDOR** (`/ai/breakdown` #209,
  `/ai/classify` #249) and the **chat** payload for **input bounds** (#320), but `/ai/parse`'s **input
  bounds** had no daily DFX presence. Its body is validated by `validate("json", ParseBody)`
  (`routes/ai.ts:300-303`) **before** any LLM call, with two load-bearing bounds: `text:
  z.string().min(1).max(500)` — the free text injected verbatim into the prompt (`Input: "${text}"`);
  `max(500)` is the **only** bound on how much attacker-controlled text reaches the model
  (prompt-cost / oversized-input surface) and `min(1)` rejects an empty capture — and `locale:
  z.enum(["en","zh"]).optional()`. A regression loosening `text` to `z.string()` (unbounded prompt) or
  dropping the `locale` enum would slip past every existing case, surfacing only as runaway LLM cost / a
  malformed prompt in prod. `/ai/parse` has a graceful **no-LLM fallback** — with no provider configured
  (the daily ephemeral harness) a *valid* request returns 200 with a deterministic `{ title: text.trim(),
  quadrant:"unclassified", confidence:0 }` — so both the 400 (bad input) and 200 (valid input degrades
  gracefully, never a 5xx) paths are fully verifiable with no AI provider. Closed with **4 cases** over
  real HTTP + real file SQLite (a dedicated actor keeps the per-user classify rate-limit from coupling to
  other blocks): **AC1** — over-cap `text` (> 500) → 400 `VALIDATION_ERROR` naming `text`, before any LLM
  call; **AC2** — empty `text` (`""`) → 400 naming `text` (the `min(1)` lower bound); **AC3** —
  out-of-enum `locale` (`"fr"`) → 400 naming `locale`; **AC4** — a valid `text` → 200 graceful fallback
  (`quadrant:"unclassified"`, title echoes the trimmed input, `confidence:0`). Mutation-tested with
  **perfect specificity**: loosening `text` to `z.string()` reddens **exactly** AC1 + AC2 (AC3 + AC4
  green); loosening the `locale` enum reddens **exactly** AC3 (AC1/AC2/AC4 green); restored → all green.
  Handler/contract verified already correct → **gap in the tests, not the code** (test + docs only, no
  production change). dfx 125 → 129.

- **2026-07-07 (#284 auth/refresh rotation, single-use & reuse-detection)** — Test-gap audit of the
  **refresh-token lifecycle**, the security backbone of "stay signed in without a 7-day bearer token".
  `POST /v1/auth/refresh` (`routes/auth.ts:175`) exchanges a long-lived refresh token for a fresh access
  token and **rotates** the refresh token every use (`rotateRefreshToken`, `lib/refreshToken.ts:80`); its
  invariants — single-use rotation, **theft response** (replaying an already-revoked token revokes the
  *whole* family via `revokeAllForUser`, killing the legitimate client too), revocation-on-signout, and
  **session-version invalidation** (a password change bumps `session_version` and strands outstanding
  tokens) — were exercised **only in-process** (`api/auth-refresh.test.ts` via `app.request()`), never
  over real `fetch()` + a real **file** SQLite in the daily suite (the layer that has caught file-DB-only
  bugs the in-memory tests missed). The auth-token security core had **zero** daily-suite coverage.
  Closed with **5 cases** over real HTTP + real file SQLite (dedicated actors per test isolate token
  families so a family-revoke can't bleed across cases): **AC1** — a valid refresh → 200 with a working
  new access token (authenticates `GET /v1/tasks`) + a **rotated** refresh token (≠ presented), and the
  presented token is now single-use dead (replay → 401); **AC2** — replaying the rotated token → 401
  `INVALID_REFRESH_TOKEN` **and the legitimate successor token also dies** (401) — the theft-response
  family revoke; **AC3** — unknown token → 401 (never 5xx), missing field → 400 `VALIDATION_ERROR`, and
  the server recovers (a real token still refreshes afterward); **AC4** — a refresh token handed to
  `/signout` can no longer refresh (→ 401); **AC5** — a password change strands the pre-change refresh
  token (→ 401). Mutation-tested with **perfect specificity**: neutering the theft-response family revoke
  (`revokeAllForUser(row.user_id)`) reddens **exactly** AC2 (the replayed token still 401s — it is
  revoked — so only the *successor*-dies assertion catches it; AC1/AC3/AC4/AC5 green); removing the
  `row.session_version < user.session_version` guard reddens **exactly** AC5 (AC1–AC4 green); restored →
  all green. Handler/lib verified already correct → **gap in the tests, not the code** (test + docs only,
  no production change). dfx 129 → 134.

- **2026-07-07 (#380 `/v1/ai/chat` context.todayTasks / recentCompleted bounds)** — Sibling to #320,
  which pinned the `messages` array / per-message `content` caps on the same endpoint. `ChatBody.context`
  (`routes/ai.ts:358`) also carries the two **largest client-supplied nested payloads** injected into the
  LLM prompt — `todayTasks` (array `.max(50)`, each `title.max(500)` / `quadrant.max(20)`; up to 50×500
  chars of task titles) and `recentCompleted` (array `.max(20)`, each `title.max(500)`) — yet neither had
  daily robustness coverage. There is **no body-size middleware**, so these Zod caps are the *sole* bound
  on how much task data floods the prompt (cost / prompt-injection-surface / memory amplification); a
  regression loosening any cap, or a 5xx on an oversized body instead of a clean 400, would slip past
  every other DFX case and surface only as inflated LLM cost in prod. `validate("json", ChatBody)` runs
  before the handler, so both the 400 (bad input) and 200 (valid → no-key `fallback:true`) paths verify
  with no AI provider. Closed with **4 cases** over real HTTP + real file SQLite: **AC1** — over-cap
  `context.todayTasks` (51) → 400 `VALIDATION_ERROR` naming `context.todayTasks`; **AC2** — over-length
  `context.todayTasks.0.title` (> 500) → 400 naming the dotted path **+ a normal chat still 200
  afterward** (recoverability); **AC3** — over-cap `context.recentCompleted` (21) → 400 naming
  `context.recentCompleted`; **AC4** — a body **exactly at both caps** (50 todayTasks / 20
  recentCompleted, all valid) → 200 `fallback:true` (caps sit at 50/20, not below). Mutation-tested with
  **perfect specificity**: loosening the `todayTasks` array cap reddens **exactly** AC1, the per-title cap
  reddens **exactly** AC2, the `recentCompleted` cap reddens **exactly** AC3 — AC4 stays green throughout;
  restored → all green. Handler/contract verified already correct → **gap in the tests, not the code**
  (test + docs only, no production change). dfx 134 → 138.

- **2026-07-07 (#390 `GET /v1/user` profile + stats aggregate tenant scoping)** — `GET /v1/user`
  (`routes/user.ts`) returns the caller's profile **plus an aggregate stats block** — `stats.tasks`
  (`COUNT(CASE WHEN completed = 0 …)`, open tasks) and `stats.pomodoros` (`SUM(pomos_done)`) — computed by a
  single query scoped `WHERE user_id = :uid AND deleted_at IS NULL`. Unlike every other user-scoped read —
  which returns *rows* pinned by the #158 isolation sweep — this is the app's **only user-facing
  cross-tenant _aggregate_**, and it had **zero** presence in this daily suite (only the per-PR in-process
  `api` suite exercised it). A regression dropping the `WHERE user_id = :uid` on the stats query would
  **silently fold another tenant's open-task + pomodoro counts into the caller's profile** — an
  information-disclosure leak with **no status-code change** (still `200`), invisible to every existing
  case. Closed with **3 cases** over real HTTP + real file SQLite, using *fresh dedicated actors* (not the
  shared alice/bob, whose counts other tests mutate) so the exact-count assertions are deterministic; the
  owner is seeded with 3 open + 1 **completed** task and 2 pomodoros (via `POST /v1/focus/sessions`, the only
  `pomos_done` write path — it's hardcoded 0 on create), the other tenant with **different, non-zero** 5
  open / 3 pomodoros: **AC1** — no token → 401 `UNAUTHORIZED`, a garbage bearer → 401 (never 500), a valid
  token → 200; **AC2** — profile identity: the response `email`/`name`/`id` are the token-owner's (row loaded
  from the JWT, not another tenant); **AC3** — the load-bearing case: the owner's `stats.tasks` is **exactly
  3** (excludes the completed task — pins the `completed = 0` predicate — and excludes the other tenant's 5)
  and `stats.pomodoros` is **exactly 2** (never the other tenant's 3 folded in), with the other tenant's own
  view (5 / 3) as a positive control that both tenants hold real, different, non-zero data. Mutation-tested
  with **perfect specificity**: dropping `WHERE user_id = :uid` on the aggregate reddens **exactly** AC3
  (AC1/AC2 green); replacing `COUNT(CASE WHEN completed = 0 …)` with `COUNT(*)` also reddens **exactly** AC3
  (the open-only predicate has its own teeth); restored → all green. Handler already scoped → **gap in the
  tests, not the code** (test + docs only, no production change). dfx 146 → 149.
