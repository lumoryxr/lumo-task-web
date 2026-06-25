# ADR 0002 — Per-user database + libSQL embedded replica (local-first sync)

- Status: **Proposed** (pending sign-off on the open decisions below)
- Date: 2026-06-25
- Requirement: data-sync redesign (Jalen chose "每用户一个库", 2026-06-25)
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

### 2. Provisioning
On signup, the backend creates the user's data DB + a **scoped** auth token via
the Turso Platform API (or self-hosted `sqld`), and records it in
`user_databases` (token encrypted at rest with the existing `crypto.ts`). The
"sync toggle" becomes "this user already has a cloud DB" — no manual URL pasting
(today's UX requires the user to create a Turso DB and paste URL+token).

### 3. Request routing (web / server-authoritative)
A per-request resolver maps the authenticated `userId` → their data-DB libSQL
client, from an **LRU connection cache** (bounded, idle-evicted). Web requests
connect directly to the user's DB. Auth (JWT) stays in the control plane and is
unchanged → multi-device "just works", no device registration needed.

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
- **Phase 1:** control/data split + provisioning (flagged); new signups get a
  per-user DB; routing + connection cache; web reads/writes route to the user DB.
- **Phase 2:** versioned per-DB migration runner + `schema_version` gate.
- **Phase 3:** desktop/mobile embedded replica against the user DB; **delete
  `lib/sync.ts`** and the `remote_url/remote_token` settings path.
- **Phase 4:** tombstones (`deleted_at`) + monotonic write clock.
- **Phase 5:** one-time migration of existing shared-DB users into per-user DBs;
  remove the shared-data tables.

## Open decisions (need Jalen)

1. **Turso Platform (hosted) vs self-hosted `sqld`.** Hosted = trivial
   provisioning + scales to many small DBs (their database-per-tenant model),
   but per-DB on their plans/pricing. Self-hosted = full control, more ops.
   *Recommendation: hosted Turso to start (matches current deploy, least ops).*
2. **Existing production data.** There is live data in the shared Turso (Render).
   Phase 5 migration must split it per-user. Need the current volume (likely tiny
   now) to size the one-time migration. *Recommendation: do it while small.*
3. **Provision timing.** Per-user DB at **signup** (uniform routing, simplest) vs
   **lazily on first sync-enable** (fewer DBs, but two code paths). *Recommendation:
   at signup.*

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
