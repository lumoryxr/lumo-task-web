# ADR 0002 — Per-user database + libSQL embedded replica (local-first sync)

- Status: **Superseded by [ADR-0003](0003-server-authoritative-incremental-sync.md)** (2026-06-25)
- Date: 2026-06-25
- Requirement: data-sync redesign (Jalen chose "每用户一个库", 2026-06-25)

> **Superseded.** After researching how leading products sync (Todoist, Linear,
> CloudKit, Obsidian/Standard Notes, PowerSync), the per-user-database approach
> was judged too complex/ops-heavy for this stage. The project adopts a
> server-authoritative incremental sync on the existing multi-tenant DB instead —
> see **ADR-0003**. This document is kept for the historical decision trail and
> the still-valid analysis of the original two sync mechanisms.
- Related: #63/#64 (stopgap: gated the leaking app-level sync to single-tenant)

## Context

The product goal: **local-first** (data in local SQLite), an opt-in **sync toggle**
that pushes to the cloud, and **multi-device** use with real sync — built to be
production-grade at scale.

Today there are **two overlapping sync mechanisms**:

1. **libSQL embedded replica** (`db/client.ts`): when `TURSO_SYNC_URL` is set the
   DB client is a local file replica that syncs to a remote Turso primary. This
   is the desktop path and is the *right* primitive.
2. **Hand-rolled app-level table sync** (`lib/sync.ts`): push/pull `tasks` +
   `completed_entries` by `updated_at` LWW, cursors in `sync_cursors`. This path
   is **single-tenant by assumption** and was the source of a cross-tenant leak
   (`SELECT … LIMIT 1` remote config + unscoped `SELECT * FROM tasks`). It is
   redundant with (1), only covers 2 of 7 data domains, has no tombstones, and
   mixes local/remote clocks in its cursor. #64 gated it to single-tenant as a
   stopgap; **this ADR removes it.**

Other current facts: web is a thin client (no local SQLite); the cloud (Render)
runs a **single shared** Turso DB, multi-tenant by `user_id`; conflict handling
is naive LWW with **no tombstones** (deletes resurrect across devices); schema is
hand-maintained in 3+ places (`migrate.ts`, `ensureRemoteSchema`, the sync INSERT
column lists). `@libsql/client` 0.17.4 supports embedded replicas.

## Decision

**Each user gets their own libSQL/Turso database.** Split control plane from data
plane; use libSQL's native embedded-replica sync for local-first devices; delete
the hand-rolled sync.

### 1. Control plane vs data plane
- **Control DB** (the existing shared DB, minus user data): `users`, auth
  (`revoked_tokens`, `session_version`), and a new `user_databases` table
  `(user_id PK, db_name, region, auth_token_enc, schema_version, created_at)`.
- **Per-user data DB**: all user data — `tasks`, `completed_entries`, `settings`,
  `people`, `habits`, `countdowns`, `focus_sessions`. No `user_id` scoping needed
  *within* a user DB (isolation is by-database), but keep the column for now to
  minimize churn.

### 2. Provisioning — **hosted Turso, lazy on first sync-enable** (decided)
DBs are created **the first time a user enables sync** (not at signup), via the
**hosted Turso Platform API** (an org-level API token held as a backend secret,
e.g. `TURSO_PLATFORM_TOKEN`). Flow:

1. User flips the sync toggle → **a confirmation prompt ("二次提醒")** explains
   what enabling sync does (creates a cloud copy of their data) and requires an
   explicit confirm. No DB is created on the first tap.
2. On confirm, the backend: creates `lumo-user-<id>` + mints a **scoped** auth
   token, records it in `user_databases` (token encrypted via `crypto.ts`),
   **copies the user's current data** into the new DB, then switches the device
   to embedded-replica mode against it.

This means users who never enable sync never get a cloud DB (no idle DBs, no
manual URL pasting — today's UX requires the user to create a Turso DB by hand
and paste URL+token). It also folds the "existing data migration" question into
the normal enable-sync path: copy-on-enable, per user, when they opt in.

### 3. Request routing (web / server-authoritative)
A per-request resolver maps the authenticated `userId` → their data store, from
an **LRU connection cache** (bounded, idle-evicted). Because provisioning is
lazy, routing is **hybrid**: a user with no `user_databases` row reads/writes the
**shared data store** (today's behaviour, unchanged); once they enable sync, they
route to **their own per-user DB**. Auth (JWT) stays in the control plane and is
unchanged → multi-device "just works", no device registration needed. (The
shared store is retired only if/when every active user has opted in; otherwise it
remains the home for sync-off users.)

### 4. Local-first devices (desktop / mobile)
The device runs an **embedded replica of the user's own data DB**:
`createClient({ url: file:<local>, syncUrl: <user db url>, authToken, syncInterval })`.
libSQL handles offline writes + bidirectional sync natively; `db.sync()` for
manual. **No hand-rolled push/pull.** (Web can't run a replica in-browser → it
stays server-authoritative against the same per-user DB. Coherent split.)

### 5. Conflict semantics
Keep **last-write-wins** (fine for a personal task app — true concurrent
same-field edits are rare), but make it correct:
- **Tombstones**: add `deleted_at` (soft delete) so deletes propagate instead of
  resurrecting. Hard-delete/GC tombstones after a retention window.
- **Monotonic timestamps**: server-authoritative write time (or HLC) so a skewed
  device clock can't silently win and drop another device's edit.

### 6. Migrations across N databases
Schema is owned centrally and applied **per data DB**: a versioned, ordered,
recorded runner (replacing ad-hoc `CREATE IF NOT EXISTS`), gated by a
`schema_version` per DB. **Lazy-migrate on first connect** within a process
(check `user_databases.schema_version`; if behind, apply pending migrations,
then bump). Removes the 3-place hand-copied schema drift.

## Phased rollout (each phase = its own PRD→contract→TDD→review→merge)

- **Phase 0 — done:** stop the leak (#64, app-level sync gated to single-tenant).
- **Phase 1:** provisioning service (hosted Turso Platform API, behind a
  mockable interface) + `user_databases` control table + hybrid routing/connection
  cache (sync-off → shared store; sync-on → per-user DB). No behaviour change for
  sync-off users.
- **Phase 2:** enable-sync flow — **confirmation prompt ("二次提醒")** → provision
  → **copy current data into the new DB** → flip routing. Idempotent + resumable.
- **Phase 3:** versioned per-DB migration runner + `schema_version` gate.
- **Phase 4:** desktop/mobile embedded replica against the user DB; **delete
  `lib/sync.ts`** and the `remote_url/remote_token` settings path.
- **Phase 5:** tombstones (`deleted_at`) + monotonic write clock.

## Decisions resolved (Jalen, 2026-06-25)

1. **Hosting:** ✅ **Hosted Turso Platform** (least ops, database-per-tenant is a
   first-class feature). Needs an org-level `TURSO_PLATFORM_TOKEN` backend secret.
2. **Existing data:** folded into **copy-on-enable** — a user's data is copied to
   their new DB when they opt into sync; no separate bulk migration needed while
   the shared store still serves sync-off users.
3. **Provision timing:** ✅ **Lazy — on first sync-enable**, with a **confirmation
   prompt ("二次提醒")** before any DB is created.

## Prerequisite from Jalen
- A **Turso Platform API token** (org scope, can create databases) to set as the
  backend secret `TURSO_PLATFORM_TOKEN` on Render. Implementation hides the
  Platform API behind a mockable interface, so Phases 1–2 can be built and tested
  without it, but real provisioning needs this token configured.

## Consequences

- **Pro:** real local-first + offline writes via a battle-tested primitive;
  tenant isolation by construction (the leak class is impossible); scales to
  large user counts (many small DBs); removes the buggy hand-rolled sync and the
  3-place schema drift; web + desktop share one source of truth per user.
- **Con / cost:** new provisioning + connection-routing layer; per-DB migration
  orchestration (the real operational work); a one-time data migration for
  existing users; more moving parts than a single shared DB.
- **Rejected alternatives:** (a) single shared cloud DB + thin client — simplest
  but no real local-first on web and keeps the multi-tenant blast radius; (b) a
  full CRDT sync engine (ElectricSQL/PowerSync) — over-engineered for a personal
  task app's conflict profile.
