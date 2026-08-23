# ADR 0007 — SQLite/Turso scaling ceiling & the Postgres migration trigger

- Status: **Accepted** (decision recorded; migration deferred)
- Date: 2026-08-12
- Requirement: #475 — "Postgres 迁移 ADR (文档)". SQLite/Turso is a **single-writer**
  store; before team features or large scale, record *when* and *how* we would
  move to Postgres so the decision is deliberate, not a fire drill.

## Context

Lumo's backend runs on **libSQL (Turso)** with hand-written parameterized SQL
(no ORM — see the contract-first + `db/client.ts` conventions). This is a
deliberate fit for the current product:

- **Per-user data, low write-contention.** Each user's rows are isolated
  (`WHERE user_id = …` everywhere; tenant isolation is enforced and tested). The
  hot path is single-user reads/writes, not cross-tenant fan-out.
- **Operationally tiny.** One file / one managed Turso DB, logical `.sql`
  backups, cheap to run for a free public beta.

The structural limit is that **SQLite/libSQL serializes writes** (one writer at a
time; readers are concurrent). That is invisible at beta volume but becomes the
ceiling under two futures:

1. **Team / shared workspaces** — multiple users writing the *same* logical
   dataset concurrently (shared projects, real-time collaboration) turn
   per-user isolation into genuine write-contention on shared rows.
2. **Large scale** — sustained high write throughput (many thousands of
   concurrent active writers) queues on the single writer regardless of sharding
   by user.

Neither is on the current roadmap; the app is a single-user focus/Eisenhower
tool in free public beta. Migrating now would be **premature** — added ops
burden and connection-pool/txn semantics for a bottleneck we don't yet hit.

## Decision

**Stay on libSQL/Turso for now. Migrate to Postgres only when a concrete
trigger fires**, and treat the SQL layer so that migration stays a bounded
project rather than a rewrite:

**Migration triggers (any one):**

- We ship **team / shared-workspace** features with concurrent writes to shared
  rows (not just per-user data).
- Sustained write throughput approaches the single-writer ceiling (watch write
  latency / `busy`-style contention once monitoring — #471 — is live).
- We need capabilities libSQL doesn't serve well: rich concurrent transactions,
  `LISTEN/NOTIFY`, mature read-replica topologies, or Postgres-only extensions.

**Keep migration cheap (do these regardless):**

- Keep SQL **parameterized and standard** (`:name` binds; no engine-specific
  syntax). Avoid SQLite-only idioms in new code where an ANSI equivalent exists;
  where a SQLite-ism is unavoidable (e.g. `json_each`, `INSERT OR IGNORE`,
  `datetime('now')`), isolate it and note the Postgres equivalent inline.
- Keep the DB access behind `db/client.ts` (`query` / `queryOne` / `execute` /
  `batch`) so the driver swap is one module, not every route.
- Keep migrations forward-only and idempotent (already the house style in
  `db/migrate.ts`).

## Consequences

- **Now:** no code change. This ADR is the recorded decision + watch-list. The
  single-writer ceiling is a *known, accepted* constraint for the beta, not an
  accident.
- **When a trigger fires:** the migration is scoped to (a) provision Postgres,
  (b) port the schema in `db/migrate.ts` (types: `TEXT`→`text`, `INTEGER` bool
  flags→`boolean`/`smallint`, `datetime('now')`→`now()`), (c) swap the driver in
  `db/client.ts` behind the existing `query/execute/batch` surface, (d) port the
  handful of SQLite-only idioms, (e) migrate data (logical dump → transform →
  load), (f) run the existing four-layer test pyramid against Postgres in CI.
  Because routes only touch the `db/client.ts` surface, the blast radius is the
  data layer, not the app.
- **Contract-first is unaffected:** `@lumo/contracts` describes wire shapes, not
  storage, so no API/contract change is implied by the engine swap.

## Related

- ADR 0002 — per-user database sync (the isolation model this leans on).
- #471 — reliability/monitoring (the write-latency signal that would trip the
  throughput trigger).
- #475 — commercialization "Growth & Polish" (this ADR is its documentation item).
