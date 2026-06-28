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

## Recommended: scheduled backup in CI

Add this workflow (it needs `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` repo
secrets) to run a daily dump and retain it as an artifact. It is intentionally
**not** committed as an active workflow until the secrets and retention target
are agreed — copy it in when ready:

```yaml
# .github/workflows/db-backup.yml
name: DB Backup
on:
  schedule: [{ cron: "0 3 * * *" }]   # 03:00 UTC daily
  workflow_dispatch: {}
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
        working-directory: backend
      - name: Dump
        working-directory: backend
        env:
          TURSO_DATABASE_URL: ${{ secrets.TURSO_DATABASE_URL }}
          TURSO_AUTH_TOKEN: ${{ secrets.TURSO_AUTH_TOKEN }}
        run: |
          mkdir -p backups
          npm run backup > backups/lumo-$(date +%F).sql
      - uses: actions/upload-artifact@v4
        with:
          name: db-backup-${{ github.run_id }}
          path: backend/backups/*.sql
          retention-days: 30
```

For production durability, push the artifact to an encrypted bucket (S3/R2)
with lifecycle retention instead of (or in addition to) GitHub artifacts.

## Notes

- Per-customer deployments (see [per-customer-deployment.md](./per-customer-deployment.md))
  each have their own database — back up each one with its own credentials.
- The dump is logical, so it survives libSQL/SQLite version changes and can
  seed a local dev DB from prod-shaped data.
