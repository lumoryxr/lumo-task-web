# Database backup & restore

Turso's free tier has **no point-in-time recovery (PITR)**. A scheduled
**logical backup** (a portable `.sql` dump of every row) is our safety net
against accidental deletion, a bad migration, or tenant data loss.

## What the backup is

`npm run backup` (→ `backend/src/db/backup.ts`) connects with the same
`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` the backend uses and prints a single
SQL file to stdout:

- every user table (`sqlite_%` internals are skipped — they're recreated by the schema),
- one `INSERT` per row, wrapped in `BEGIN … COMMIT` with `PRAGMA foreign_keys=OFF`,
- identifiers and values quoted/escaped (embedded quotes doubled, blobs as `X'hex'`).

It is **read-only** — it never writes to the database.

## Run a backup manually

```bash
cd backend
mkdir -p backups
# point at the environment you want to back up:
export TURSO_DATABASE_URL=libsql://<db>.turso.io
export TURSO_AUTH_TOKEN=<token>
npm run backup > backups/lumo-$(date +%F-%H%M).sql
```

Store the file somewhere durable (object storage / encrypted bucket). Treat it
as sensitive: it contains all user rows (password **hashes**, not plaintext).

## Restore into a fresh database

```bash
# 1. create the schema on the target DB
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run migrate
# 2. replay the dump
turso db shell <target-db> < backups/lumo-2026-06-28-0900.sql
```

Because the dump is plain `INSERT`s inside a transaction, a partial/corrupt
file fails atomically rather than half-loading.

## Scheduled backup in CI (committed, opt-in)

The scheduled workflow lives at [`.github/workflows/db-backup.yml`](../../.github/workflows/db-backup.yml).
It is **safe to keep committed**: without the `TURSO_DATABASE_URL` secret the job
**skips cleanly** (emits a notice, stays green) instead of failing every night on
an empty database. It runs daily at 03:00 UTC and can also be triggered manually
(`workflow_dispatch`).

**To activate backups:**

1. Add repo secrets `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (the production
   database credentials).
2. The next scheduled run — or a manual **Run workflow** dispatch — dumps the DB
   and uploads it as an artifact (`retention-days: 30`).

The dump step fails loudly if the produced `.sql` is empty (a silent 0-byte
backup is worse than a red run). For production durability, push the artifact to
an encrypted bucket (S3/R2) with lifecycle retention instead of (or in addition
to) GitHub artifacts.

## Notes

- Per-customer deployments (see [per-customer-deployment.md](./per-customer-deployment.md))
  each have their own database — back up each one with its own credentials.
- The dump is logical, so it survives libSQL/SQLite version changes and can
  seed a local dev DB from prod-shaped data.
