#!/usr/bin/env bash
# On-box backup of the local SQLite database (the mounted-disk deployment).
# A libsql local file is a standard SQLite database, so `sqlite3 .backup` gives a
# consistent copy even while the app is running (no downtime). Run it from cron.
#
# Usage:
#   bash deploy/vps/backup.sh
# Cron (daily 03:15), as the box's deploy user:
#   15 3 * * * /opt/lumo/deploy/vps/backup.sh >> /var/log/lumo/backup.log 2>&1
#
# Env (override as needed):
#   LUMO_DATA_DIR   host dir holding lumo.db  (default /mnt/lumo-data)
#   DB_FILE         path to the DB            (default $LUMO_DATA_DIR/lumo.db)
#   BACKUP_DIR      where dumps go            (default $LUMO_DATA_DIR/backups)
#   RETAIN_DAYS     prune dumps older than N  (default 14)
#   RCLONE_REMOTE   optional rclone target (e.g. r2:lumo-backups) for off-box copy
set -euo pipefail

DATA_DIR="${LUMO_DATA_DIR:-/mnt/lumo-data}"
DB_FILE="${DB_FILE:-$DATA_DIR/lumo.db}"
BACKUP_DIR="${BACKUP_DIR:-$DATA_DIR/backups}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"

if [ ! -f "$DB_FILE" ]; then
  echo "backup: DB not found at $DB_FILE — nothing to do (Turso mode uses db-backup.yml instead)." >&2
  exit 0
fi
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "backup: sqlite3 not installed. Install it (apt-get install -y sqlite3) or run the dump in a container." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%F-%H%M%S)"
OUT="$BACKUP_DIR/lumo-$STAMP.db"

# Consistent online snapshot (safer than cp for a live DB).
sqlite3 "$DB_FILE" ".backup '$OUT'"
gzip -f "$OUT"
OUT="$OUT.gz"

# A 0-byte (or missing) dump is worse than a loud failure.
if [ ! -s "$OUT" ]; then
  echo "backup: produced an empty file at $OUT" >&2
  exit 1
fi
echo "backup: wrote $OUT ($(du -h "$OUT" | cut -f1))"

# Prune old local dumps.
find "$BACKUP_DIR" -name 'lumo-*.db.gz' -type f -mtime "+$RETAIN_DAYS" -delete || true

# Optional off-box copy (durability): push to an object store via rclone.
if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$OUT" "$RCLONE_REMOTE" && echo "backup: uploaded to $RCLONE_REMOTE"
fi
