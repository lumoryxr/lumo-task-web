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

## Architect-review amendments (2026-06-25)

Hardening folded in after an adversarial architecture/security review:

1. **Sync cursor = monotonic server sequence, not wall-clock.** Add a server-
   assigned monotonic `seq` (per-user counter) stamped on every write; the delta
   query is `WHERE seq > :cursor ORDER BY seq`. Wall-clock `updated_at` has
   same-millisecond, NTP-rollback, and restart edge cases that drop or duplicate
   deltas. (The existing `cursor.ts` is `created_at`-keyset for list pagination —
   not reused for the delta cursor.)
2. **Server owns all sync metadata; clients can never set it.** `updated_at`,
   `created_at`, `deleted_at`, `seq` are stamped server-side only. A **standards
   test** forbids these fields in any write DTO (a client backdating `updated_at`
   could hide from delta or always win LWW — an injection vector).
3. **Delta endpoint must paginate.** `?since=*` full snapshots reintroduce the
   ADR-0001 unbounded-response/OOM problem; the delta itself is keyset-paginated.
   The cursor is validated against the authenticated user and carries no forgeable
   tenant scope — this is the single highest-value cross-tenant surface, so it
   gets the heaviest DFX/authz coverage.
4. **Idempotency keys are per-user, persisted, and replay-safe.** An
   `idempotency_keys(user_id, key, result, created_at)` table; a replayed
   mutation returns the **cached result** rather than re-executing; keys are
   namespaced by `user_id` (a global key space would let one user probe another's
   results). TTL'd.
5. **LWW granularity.** Row-level LWW can clobber concurrent edits to *different*
   fields of one entity (device A edits due date, device B completes → one lost).
   Decision: field-level mutation commands for high-conflict fields where it
   matters; otherwise row-level LWW is accepted and **documented** as a known
   limitation (not a silent bug).
6. **Soft-delete vs uniqueness.** Audited: the 5 syncable tables (`tasks`,
   `completed_entries`, `people`, `habits`, `countdowns`) have **no secondary
   UNIQUE** constraints (only `users.email` and `habit_logs`'s composite PK, both
   out of scope), so tombstones don't strand a unique slot today. **Rule going
   forward:** any new UNIQUE on a soft-deletable table must be a *partial* index
   `WHERE deleted_at IS NULL`.
7. **Offline-beyond-retention → forced full resync.** A client whose cursor is
   older than the tombstone-GC horizon must be told to full-resync (`410` →
   `since=*`), else GC'd deletes resurrect. The GC horizon and this check are
   designed together in Phase 5.

Operational consequences elevated by the single-shared-DB choice (blast radius =
all tenants): **backups/PITR + versioned, reversible migrations become hard
prerequisites** (a bad GC/migration hits everyone at once); the `deleted_at IS
NULL` read filter is enforced via a shared query helper + a standards/DFX test
that flags unfiltered reads; soft-delete FK/cascade semantics (task → its
completed entries / subtasks / assignees) are defined per domain; the offline
queue must handle ordering, poison mutations (a rejected mutation can't block the
queue), and stale-write reconciliation; the delta endpoint is rate-limited
(full vs partial, à la Todoist). Accepted, explicitly-documented trade-offs:
polling (not real-time push); task content stored plaintext at rest (required for
server-side AI — the cost of rejecting E2EE); SQLite single-writer ceiling;
desktop's move from embedded-backend to thin-client+cache is its own design
(Phase 4/5), not a footnote.

## References
- Todoist Sync API — https://developer.todoist.com/sync/v8/
- Linear sync engine (reverse-engineered) — https://github.com/wzhudev/reverse-linear-sync-engine
- Apple CloudKit private database — https://developer.apple.com/documentation/CloudKit/CKContainer/privateCloudDatabase
- Standard Notes (E2EE) — https://standardnotes.com/
- PowerSync — https://powersync.com/
