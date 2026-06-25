# ADR 0004 — Single-tenant: one environment = one database

- Status: **Proposed**
- Date: 2026-06-25
- **Supersedes: ADR-0002 and ADR-0003**
- Requirement: Jalen (2026-06-25). After two over-built sync attempts, the chosen
  model is the simplest one that gives isolation *by construction*: the app is
  single-tenant; isolation comes from running **separate environments**, never
  from in-app multi-tenant routing.

## Context

Two prior designs were judged too complex:

- **ADR-0002** (per-user DB + control-plane routing) — needed a catalog DB,
  per-request DB routing, per-user provisioning. Too much machinery.
- **ADR-0003** (server-authoritative incremental sync on one shared multi-tenant
  DB) — put every user in one database, so isolation rested on `user_id` filters
  in code (a review promise, not a structural guarantee), and required a hand-built
  delta endpoint, client offline queue, and `seq` triggers.

Key facts about the app that make a simpler model correct:

- **No cross-account sharing exists.** `people` are a single user's contacts
  (`user_id REFERENCES users(id)`); `assignee_ids` only reference the owner's own
  people. There is no collaboration, shared workspace, or inviting other accounts.
  So no cross-database join is ever needed.
- The backend DB client (`db/client.ts`) **already** supports three modes — local
  file, embedded replica (local file + Turso sync), and direct cloud — which map
  exactly onto the desktop and per-customer-web scenarios below.

## Decision

The product is **single-tenant**. There is exactly **one database per running
environment**. Isolation is the **deployment boundary**, not in-app logic.

An "environment" is one self-contained unit = one backend + one database:

| Surface | Environment | Database |
| --- | --- | --- |
| **Desktop** | one install on one machine | one local SQLite file (`lumo.db`), optionally mirrored to one Turso DB |
| **Web (B2B)** | one isolated deployment **per customer** | that deployment's own Turso DB |

### Desktop — local file ⟷ one cloud DB

- Sync **off**: a single local `lumo.db`, fully offline.
- Sync **on**: the local file becomes a **libSQL embedded replica** of the user's
  own Turso DB — local-first reads/writes, near-real-time background bi-directional
  sync. The remote is that environment's own DB, so the local replica can only ever
  hold that environment's data.
- Multiple devices on the same account point at the same Turso DB → they converge.
- Provisioning is **one-click** (decision below): a small hosted provisioning
  service (we operate it) creates the Turso DB + mints a scoped token and hands it
  back to the desktop, which stores it encrypted and configures the replica. The
  user never pastes a URL/token. The **Turso Platform token lives only in the
  provisioning service**, never on the desktop; the desktop only ever holds its own
  DB's scoped token.

### Web — one deployment per customer (B2B)

- Each customer gets an **independent deployment** (own backend + own Turso DB),
  configured via a single `TURSO_DATABASE_URL` (existing "cloud" mode). Zero
  multi-tenant logic. Cross-customer access is impossible — they are separate
  processes against separate databases.
- Multiple users **within** one customer environment are kept (decision below):
  the existing account / `user_id` model is retained, but it scopes only *inside*
  that one environment and is **not** a cross-customer security boundary.

## Decisions locked with Jalen (2026-06-25)

1. **Web is B2B, one environment per customer.** Not mass-market self-serve.
2. **Desktop credentials: one-click provisioning**, infra operated by us (Turso
   Platform API behind a small provisioning service).
3. **Multiple users per environment** — keep the current auth/`user_id` logic
   unchanged; it is intra-environment only.
4. **No migration of existing shared-DB data** — start clean.

## Consequences

- **Pro:** isolation by construction (deployment boundary); the strongest, simplest
  story to tell a B2B customer. Removes the entire shared-multi-tenant-DB path and
  the cross-tenant guards built around it. Lets us delete the hand-built sync
  machinery (delta endpoint, offline queue, `seq` triggers, idempotency keys) —
  desktop uses libSQL native replica sync, web reads its DB directly. Net: less
  code, stronger isolation.
- **Con / honest trade-offs:**
  - **Per-customer deployment has operational cost** — each web customer is a
    deployment to provision, upgrade, monitor, and pay for. Fine for tens/hundreds
    of B2B customers; would not scale to mass-market self-serve (out of scope by
    decision 1).
  - **"Real-time" is near-real-time** — embedded replica syncs on an interval +
    on demand (seconds), not millisecond-live. Adequate for one user's own devices.
  - **First-enable merge** — when desktop sync is enabled and both the local file
    and a pre-existing cloud DB hold data, a merge policy is needed (push-local /
    pull-cloud / merge). Default: push-local on first enable of a fresh DB.
  - **We now run a provisioning service** (decision 2) and hold a Turso Platform
    token — the new crown-jewel secret; backend-only, never shipped to clients.

## Rollback / simplification plan (revert ADR-0003 machinery)

This is a forward simplification toward the target, not a literal `git revert`
(there is no past commit matching this exact target, and recent fixes — Windows
startup #56, i18n, the register-error fix — are kept).

**Remove (backend):**
- `routes/sync.ts`: the delta endpoint `GET /v1/sync` (keep `GET /sync/status` and
  `POST /sync` — the embedded-replica controls the desktop uses).
- `lib/idempotency.ts` and its use in create routes (was for offline-queue replay).
- `lib/gc.ts` + `startGcScheduler` in `index.ts`.
- `seq` triggers + `sync_seq` table machinery in `migrate.ts`.
- `SyncDelta*` schemas in `@lumo/contracts`.
- Cross-tenant guards that only existed to defend the shared-DB delta path.

**Remove (frontend):**
- `lib/syncEngine.ts` (delta polling) + `startSyncEngine` in `Shell.tsx`.
- `lib/writeQueue.ts` + `withOfflineQueue` in the four stores (revert to direct
  writes).
- `api.syncDelta()`.
- The manual-URL `SyncPanel` → replace with a one-click sync toggle.

**Keep:**
- Auth / `user_id` (multi-user within an environment).
- `db/client.ts` three modes; desktop embedded replica; `/sync/status` + `POST
  /sync`; the Electron sync IPC (re-skinned to one-click).
- Encryption-key / JWT provisioning in the desktop launcher (#56).
- **Tombstones (`deleted_at`)**: recommend keeping as-is (working, tested, harmless;
  removing soft-delete touches 10 route files and is higher-risk than the
  simplification is worth). Removal is optional and can be a later cleanup.

## Phased rollout (each phase = PRD → contract → TDD → one review → merge)

- **P0 — Simplify/rollback.** Remove the ADR-0003 machinery above; collapse to the
  three `db/client.ts` modes. No behavior change for a single local desktop user.
- **P1 — One-click desktop provisioning.** Provisioning service (Turso Platform API
  → create DB + scoped token); desktop sync toggle calls it, stores creds encrypted,
  configures the embedded replica; first-enable copies local → new DB.
- **P2 — Per-customer web environment.** Deployment template + runbook/script to
  stand up an isolated environment (own backend + own Turso DB) per B2B customer.
- **P3 — Cleanup.** Drop dead `seq`/contract code; optionally retire tombstones;
  decommission the old shared-DB deployment.
