# PRD — P1b: Desktop sync client + Obsidian-like toggle

- Status: **Approved** (Jalen, 2026-06-26)
- Implements: ADR-0004 Addendum → P1b. Follows P1a (generic sync core, merged in #102).

## Problem
The desktop runs a local backend against a local SQLite file (local-first, offline).
P1a built the cloud's generic per-user sync API (`/v1/sync/pull` + `/push`). P1b makes
the desktop actually use it: when the user turns sync on and signs into their cloud
account, the desktop continuously syncs **only that user's rows** to/from the shared
cloud backend, **exclusively over the authenticated HTTP API** — no direct DB, no Turso
credentials on the device.

## Architecture
A **sync client inside the local backend process** (testable, reuses `sync/engine.ts`):

- **Push**: `engine.pull(localUserId, pushCursor)` reads local rows changed since the
  cursor → HTTP `POST {cloud}/v1/sync/push` with the cloud JWT → advance `pushCursor`
  to the local pull's cursor on success.
- **Pull**: HTTP `POST {cloud}/v1/sync/pull {since: pullCursor}` → `engine.push(
  localUserId, entities)` applies the cloud rows into local SQLite (LWW) → advance
  `pullCursor` to the response cursor.
- **Identity mapping is automatic**: each side forces `user_id` from its own JWT, so a
  local row pushed to the cloud is stamped with the cloud user, and a cloud row applied
  locally is stamped with the local user. One local user ↔ one cloud user per install.
- **Conflict**: HLC row-level LWW + tombstones (same as P1a); convergence holds because
  the cloud preserves incoming `updated_at` and local applies with the same LWW rule.
- **First enable**: both cursors start at MIN_HLC → first cycle pushes all local + pulls
  all cloud → union by LWW (safe: all one user's data).

Cloud base URL is a config constant (our operated cloud backend), injected by Electron
as `LUMO_CLOUD_API_BASE`; it is OUR trusted URL, not user-entered.

## Build units
- **P1b-core** (backend, fully testable) — the sync client, cursor state, and the local
  control endpoints. *Acceptance criteria below focus here.*
- **P1b-ui** (web-app + electron) — Settings toggle rework, api client, electron wiring,
  and fixing the dangling refs P1a left.

---

## P1b-core — backend sync client

### Functional requirements
- **FR1. Cursor state.** A local table `sync_client_state` persists `push_cursor` and
  `pull_cursor` (HLC strings, default MIN_HLC) plus `last_synced_at`, `last_error`.
- **FR2. Cloud HTTP client.** `lib/cloudSync.ts` — thin wrapper for `POST {base}/v1/
  sync/pull` and `/push` and `POST {base}/v1/auth/signin`, sending `Authorization:
  Bearer <cloudJwt>`, with timeout + typed errors. Base URL from config; never user DB.
- **FR3. Sync cycle.** `runSyncCycle()` does push-then-pull as above, advancing cursors
  only on success; a failed HTTP call sets `last_error` and does NOT advance cursors
  (safe retry). Returns `{ pushed, pulled, cursors }`.
- **FR4. Enable/bind.** `POST /v1/sync/enable { email, password, cloudBase? }` signs into
  the cloud, stores the cloud JWT **encrypted** (reuse `lib/crypto.ts`) + base URL in
  local state, then runs a first full reconcile. `POST /v1/sync/disable` clears creds and
  stops syncing (local data stays).
- **FR5. Status & trigger.** `GET /v1/sync/status` → `{ enabled, lastSyncedAt, lastError,
  cursors }` (never the token). `POST /v1/sync/now` runs one cycle on demand.
- **FR6. Background loop.** When enabled, run a cycle on an interval (e.g. 30s) and on
  demand; single-flight (no overlapping cycles).

### Acceptance criteria (testable — drive a second in-process app as the "cloud")
- **AC1 (round-trip).** Local writes (via REST) → enable/sync → appear in the cloud DB
  scoped to the cloud user. Cloud writes → sync → appear in local DB. For every entity.
- **AC2 (isolation preserved).** The cloud only ever returns/accepts the cloud user's
  rows (P1a guarantee); a second cloud user's data never reaches this device. The push
  carries only local rows; user_id is forced on both ends.
- **AC3 (LWW convergence).** Concurrent edits to the same row id on local and cloud
  converge to the higher-HLC value after a cycle, regardless of order.
- **AC4 (tombstone).** A delete on one side propagates and is not resurrected.
- **AC5 (cursor resume).** A cycle advances cursors; a cycle with no changes is a no-op
  returning the same cursors; an HTTP failure leaves cursors unchanged (safe retry).
- **AC6 (creds at rest).** The stored cloud JWT is encrypted (`enc:v1:` prefix); status
  never leaks it.
- **AC7 (first reconcile).** Enabling with pre-existing data on both sides yields the LWW
  union with no loss.
- **AC8 (gates).** typecheck, api/security/standards suites, migrations idempotent.

---

## P1b-ui — web-app + electron (acceptance summary)
- **AC-U1.** Settings → Sync: with sync off, a single one-click toggle; turning it on
  prompts a **cloud account sign-in** (email/password), not a Turso URL/token. The manual
  URL/token panel is removed.
- **AC-U2.** After enabling, the panel shows synced state + last-synced time + a "Sync
  now" button calling `POST /v1/sync/now`; errors are surfaced.
- **AC-U3.** `web-app/src/api/client.ts` — `syncNow()` → `POST /v1/sync/now`; `syncStatus()`
  matches the new `{ enabled, lastSyncedAt, lastError, cursors }` shape; add `syncEnable`/
  `syncDisable`. No dangling refs to the removed `POST /sync` or old status shape.
- **AC-U4.** Electron injects `LUMO_CLOUD_API_BASE`; the old `TURSO_SYNC_URL/TOKEN`
  injection + relaunch-on-save path is removed (sync is now an in-process loop, no
  relaunch). Existing electron smoke + the SET07 sync-tab e2e still pass (text updated).

## Rollout / discipline
P1b-core (contract-first → TDD → gates → review → CI) merges, then P1b-ui. Each = one
`code-review` pass clean before merge.
