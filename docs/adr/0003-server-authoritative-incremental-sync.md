# ADR 0003 — Server-authoritative incremental sync (Todoist model)

- Status: **Accepted**
- Date: 2026-06-25
- **Supersedes: ADR-0002** (per-user database + embedded replica)
- Requirement: Jalen chose option A (2026-06-25) after researching how leading
  products sync; sync is critical and security-sensitive, and per-user-DB was
  judged too complex.

## Context

ADR-0002 proposed a per-user libSQL/Turso database + embedded replicas. Research
into how well-known products actually do sync reframed the decision:

- **Todoist** — single multi-tenant backend + a server-authoritative **incremental
  delta sync** (`sync_token` / `?since=`) + **batched commands** + an **offline
  queue** + **tombstones**. Proven at very large scale.
- **Linear** — local-first client store + delta over WebSocket, but still one
  authoritative backend; very heavy to build.
- **Apple CloudKit (Reminders/Notes)** — per-user private DB + change-tokens + LWW
  — i.e. ADR-0002's model, but it only works because **Apple operates that infra**.
  Self-building it (provisioning, routing, N-database migrations) is exactly the
  complexity we want to avoid.
- **Obsidian / Standard Notes** — E2EE. Standard Notes is zero-knowledge, so the
  **server can't read content** — which would **break this app's server-side AI**
  (classify / search / recommend read task text). E2EE is a mismatch here.
- **PowerSync / ElectricSQL / Replicache** — off-the-shelf sync engines; a viable
  "buy" if hand-rolling proves costly (kept as fallback).

Key reframings: the cross-tenant leak fixed in #64 was an **unscoped-query bug,
not a flaw of multi-tenancy**; tenant isolation is already hardened and covered by
DFX/authz tests. Security for a task app with server-side AI is best served by
**rigorous isolation + encryption at rest/in transit**, not physical per-user DBs
and not E2EE.

## Decision

Build a **server-authoritative incremental sync** on the **existing single
multi-tenant Turso database**. The cloud is the source of truth; clients keep a
local cache and sync via a delta-pull endpoint + a replayed write queue.

### 1. Tombstones (soft delete)
Add `deleted_at` (nullable ISO timestamp) to syncable domains (`tasks`,
`completed_entries`, `people`, `habits`, `countdowns`). Delete = set `deleted_at`
+ bump `updated_at`; normal reads filter `deleted_at IS NULL`; the delta endpoint
**includes** tombstoned rows so deletes propagate (fixes "deleted items
resurrect"). GC tombstones after a retention window (e.g. 90 days).

### 2. Delta-pull endpoint
`GET /v1/sync?since=<cursor>` returns, for the authenticated user, every syncable
row (including tombstones) changed since the cursor, plus a fresh opaque cursor.
`since` absent / `*` = full snapshot. Keyset on `(updated_at, id)`, **always
scoped by `user_id`**, served by the existing composite indexes. Reuses the
pagination/cursor primitives from ADR-0001.

### 3. Offline write queue
The client queues mutations while offline and replays them on reconnect as normal
authenticated REST writes. Creates carry **client-generated ids + an idempotency
key** so a replayed/retried create can't duplicate a row. The server executes
authoritatively; no client-side merge logic.

### 4. Conflict resolution — LWW on a server-authoritative clock
`updated_at` is stamped by the **server** on every write (never the client clock),
so a skewed device cannot win and silently drop another device's edit. Last writer
at the server wins per row — sufficient for a personal task app (true concurrent
same-field edits are rare). No CRDT.

### 5. Retire the hand-rolled sync
Delete `lib/sync.ts` (the buggy app-level table sync, gated single-tenant in #64)
and the `settings.remote_url/remote_token` path. Desktop offline is served by its
**local cache + replayed queue** (Todoist-style), not a separate embedded-replica
backend — removing the dual-backend complexity.

## Phased rollout (each phase = its own PRD → contract → TDD → review → merge)

- **Phase 1:** tombstones across syncable domains; reads filter `deleted_at`;
  delete endpoints soft-delete. *Independent value: fixes delete-resurrect.*
- **Phase 2:** delta-pull endpoint `GET /v1/sync?since=` (+ contract in
  `@lumo/contracts`).
- **Phase 3:** server-authoritative `updated_at` on all writes + creation
  idempotency keys.
- **Phase 4:** client local cache + offline mutation queue + replay (web first,
  then desktop).
- **Phase 5:** delete `lib/sync.ts` + `remote_url/remote_token`; desktop switches
  to the delta API; tombstone GC job.

## Consequences

- **Pro:** far simpler than per-user-DB — no provisioning, routing, or N-database
  migrations; proven model (Todoist); reuses the existing REST API, indexes, and
  hardened tenant isolation; preserves server-side AI (plaintext); each phase ships
  standalone value; the very first phase (tombstones) fixes a real data bug.
- **Con:** isolation is enforced in code, not "by construction" — mitigated by the
  DFX/authz test suites that already guard cross-tenant access; row-level LWW can
  still drop one side of a genuine concurrent same-field edit (acceptable here);
  **E2EE is off the table by design** (incompatible with server-side AI).
- **Rejected:** ADR-0002 per-user-DB (too complex / ops-heavy for this stage);
  PowerSync/ElectricSQL (viable "buy", adds an external dependency — fallback if
  hand-rolling gets costly); full CRDT (overkill for this conflict profile).

## References
- Todoist Sync API — https://developer.todoist.com/sync/v8/
- Linear sync engine (reverse-engineered) — https://github.com/wzhudev/reverse-linear-sync-engine
- Apple CloudKit private database — https://developer.apple.com/documentation/CloudKit/CKContainer/privateCloudDatabase
- Standard Notes (E2EE) — https://standardnotes.com/
- PowerSync — https://powersync.com/
