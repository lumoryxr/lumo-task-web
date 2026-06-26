# Per-customer deployment runbook (P2)

Implements **ADR-0004**: the product is **single-tenant** — one B2B customer = one
**isolated environment** = one backend + one frontend + one database. Isolation is
the **deployment boundary**, not in-app routing. Two customers can never reach each
other's data because they run as separate processes against separate databases.

> Within a single customer environment, multiple users (the customer's colleagues)
> share that one database, scoped by the app's `user_id` — an *intra-environment*
> boundary only, never a cross-customer one.

## What you provision per customer
- A dedicated **Turso database** `lumo-task-<slug>` (the customer's data).
- A **backend** service `lumo-task-backend-<slug>` (env: that DB + unique secrets).
- A **frontend** static site `lumo-task-frontend-<slug>` (env: that backend's URL).
- Unique, per-environment `LUMO_JWT_SECRET` and `LUMO_ENCRYPTION_KEY` — **never**
  shared between customers (a leaked secret must not affect any other customer).

## Prerequisites
- Turso CLI authenticated against your org: `turso auth login`.
- `openssl` or `node` (for secret generation).
- Access to your deploy platform (Render Blueprint, or any Node host + static host).

## Onboard a customer

1. **Provision** (creates the DB + token + secrets, prints the env block):
   ```bash
   scripts/provision-customer.sh acme \
     --frontend-url https://acme.lumo.app \
     --region sin
   ```
   Add `--render` to also emit a ready Render Blueprint, or `--dry-run` first to see
   every step without creating anything. The script is **idempotent** — re-running
   reuses an existing `lumo-task-<slug>` DB and mints a fresh token.

2. **Deploy the backend** with the printed env block. The required vars:

   | Var | Value |
   | --- | --- |
   | `LUMO_JWT_SECRET` | unique per customer (≥32 bytes; the script generates it) |
   | `LUMO_ENCRYPTION_KEY` | unique per customer (≥32 bytes) — at-rest AES-256-GCM |
   | `TURSO_DATABASE_URL` | `libsql://lumo-task-<slug>-<org>.turso.io` |
   | `TURSO_AUTH_TOKEN` | scoped token for that DB only |
   | `LUMO_ALLOWED_ORIGINS` | the customer's frontend origin (CORS) |
   | `NODE_ENV` | `production` |

   On boot the backend validates secrets (rejects blanks/placeholders/<32 bytes) and
   runs idempotent migrations against the customer's DB.

3. **Deploy the frontend** with `VITE_API_BASE=<backend URL>/v1`.

4. **(If the customer uses the desktop app)** build their desktop with
   `LUMO_CLOUD_API_BASE=<that backend's origin>` (no `/v1`). Desktop users then sync
   to *their* environment's backend — same isolation boundary.

## Verify
- `GET <backend URL>/health` → `200 {ok:true}`; `GET /ready` → `200` once the DB is reachable.
- Register a user on the customer's frontend; confirm it works and that the data
  lands in `lumo-task-<slug>` (`turso db shell lumo-task-<slug> "select count(*) from users"`).
- Confirm a user in customer A's frontend cannot authenticate against customer B's
  backend (different JWT secret → tokens are not portable across environments).

## Offboard a customer
1. Take down the backend + frontend services.
2. Export if contractually required: `turso db shell lumo-task-<slug> .dump > acme.sql`.
3. Destroy the database: `turso db destroy lumo-task-<slug>`.
4. Rotate/revoke nothing else — secrets were unique to that environment.

## Notes & limits
- **Operational cost scales with customers** (each is a deployment to run, upgrade,
  monitor, pay for). This is the accepted trade for structural isolation and is fine
  for tens/hundreds of B2B customers — it is **not** a mass-market self-serve model
  (ADR-0004, decision 1).
- **Schema upgrades** roll out per environment: each backend runs its own idempotent
  migrations on deploy. Deploy the same image to all customer backends to upgrade.
- The root `render.yaml` remains the single shared/demo deployment;
  `deploy/render.customer.template.yaml` is the per-customer template.
