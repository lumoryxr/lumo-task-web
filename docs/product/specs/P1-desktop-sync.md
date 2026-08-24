# PRD — P1: Local-first desktop sync (Obsidian-like, generic API sync)

- Status: **Approved** (Jalen, 2026-06-26)
- Implements: ADR-0004 Addendum (2026-06-26)
- Supersedes the earlier "one-click Turso provisioning / embedded replica" P1 scope.

## Problem & positioning

The desktop app must be **local-first like Obsidian**: all data lives in a local
SQLite file and the app is fully usable offline. Cloud sync is **opt-in**. When a
user turns sync on, their data is mirrored to the **existing shared cloud DB** — but
**only that user's own rows** may ever leave or enter the device. Cross-user access
must be impossible on the wire. Desktop↔cloud communication is **exclusively through
the authenticated HTTP API**; the desktop never connects to the cloud database
directly and never holds database credentials.

## Goals

- G1. Desktop works fully offline with a local SQLite DB; sync **off** by default.
- G2. Enabling sync logs the user into their **web account** and binds local data to
  that cloud `user_id` (Obsidian-like).
- G3. Sync pushes/pulls **only the signed-in user's rows**, enforced server-side.
- G4. The sync protocol is **generic**: a new syncable object requires registry +
  schema only, **no sync-logic rewrite**.
- G5. Conflicts resolve **deterministically and without data-resurrection** (HLC +
  row-level LWW + tombstones).
- G6. All desktop→cloud traffic is **API-only**; no direct DB connection from desktop.

## Non-goals (P1)

- Per-field merge conflict resolution (deferred; row-level LWW only).
- Cross-user sharing / collaboration (no shared objects in this app).
- End-to-end encryption of cloud data (cloud holds rows server-readable, as today).
- Web B2B per-customer deployment (that is P2).
- Organization concept (dropped).

## Build units

- **P1a** — Generic sync core (backend + contracts). *This PRD's acceptance criteria
  focus here; it is independently shippable and testable.*
- **P1b** — Desktop sync client + Obsidian-like toggle (follows P1a).

---

## P1a — Generic sync core (backend)

### Functional requirements

- **FR1. Sync manifest.** A single registry declares every syncable entity with its
  table name, contracts schema, and the four-tuple columns `{ id, user_id,
  updated_at, deleted_at }`. The pull/push engine iterates the manifest; no
  per-entity branching.
- **FR2. `POST /v1/sync/pull`.** Auth required. Body: `{ since: <HLC cursor> }`.
  Returns, per manifest entity, all rows where `user_id = <jwt subject>` **and**
  `updated_at > since` (tombstoned rows included), plus the new high-watermark
  cursor.
- **FR3. `POST /v1/sync/push`.** Auth required. Body: per-entity arrays of changed
  rows. For each row: validate against the entity's schema; **force `user_id` =
  jwt subject** (ignore/overwrite any client value); upsert by `id` applying LWW —
  the incoming row wins only if its HLC `updated_at` ≥ the stored one. Idempotent.
- **FR4. HLC.** A hybrid logical clock utility generates monotonic, cross-device
  comparable timestamps used as `updated_at`. The cursor is an HLC value.
- **FR5. Migrations.** Add `updated_at` to `people` and `completed_entries` (default
  to `created_at`/`completed_at` for existing rows). Confirm `deleted_at` on every
  manifest entity.
- **FR6. Old endpoints.** Replace the embedded-replica `GET /sync/status` + `POST
  /sync` with the new pull/push (or keep `/status` reporting "local|sync"); remove
  the replica-only assumptions.

### Acceptance criteria (testable)

- **AC1 (isolation — security).** A pull by user A returns **zero** rows owned by
  user B, for every manifest entity. A push by user A carrying rows whose body
  `user_id` is B's **must** persist them under A (server overwrites), and must
  **never** modify any row owned by B. Direct attempt to mutate B's row id by A
  results in an insert/new row under A, not a modification of B's row.
- **AC2 (generic).** Adding a new manifest entity that satisfies the four-tuple makes
  it sync (pull + push round-trips) **without changing the pull/push handlers**. A
  build-time guard test **fails** if a registered entity lacks `id`, `user_id`,
  `updated_at`, or `deleted_at`.
- **AC3 (LWW).** Given two writes to the same row id with HLC t1 < t2 applied in
  either order, the row converges to the t2 value. An incoming write with HLC <
  stored is **rejected** (no-op).
- **AC4 (tombstone, no resurrection).** A delete (tombstone at HLC t2) followed by a
  pushed stale update (HLC t1 < t2) leaves the row **deleted**. Pull returns the
  tombstone so peers converge to deleted.
- **AC5 (cursor / resume).** Pull with `since = <last cursor>` returns only rows
  changed after it. If apply fails mid-batch, the cursor is **not** advanced and a
  retry re-fetches safely (idempotent).
- **AC6 (HLC monotonic).** HLC never goes backwards across calls even with equal or
  backward wall-clock readings; two nodes' timestamps are totally ordered.
- **AC7 (auth).** Pull/push without a valid JWT return `401`. `user_id` is read
  **only** from the verified token; no request field can override it.
- **AC8 (gates).** Backend typecheck, lint, and the API / security / standards /
  contracts test suites pass; migrations run idempotently on an existing DB.

---

## P1b — Desktop sync client + toggle (acceptance summary; detailed AC at build time)

- **AC-D1.** With sync off, the desktop runs fully on the local file with no network
  calls to the cloud sync API.
- **AC-D2.** Enabling sync requires a successful web-account login; on success local
  data binds to that `user_id` and a first-enable two-way reconcile converges local
  and cloud to the union (LWW) of that user's data with no loss.
- **AC-D3.** The desktop never opens a direct DB connection to the cloud and never
  stores Turso credentials; it holds only the user's JWT, in the local backend
  process (not the renderer).
- **AC-D4.** Switching to a different account on the same install requires explicit
  confirmation and never pushes the previous account's local rows under the new one.

## Rollout / discipline

Each build unit: contract-first → TDD → local gates green → one `code-review` pass →
CI green → merge. P1a merges before P1b starts.
