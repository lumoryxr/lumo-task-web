#!/bin/sh
# Container entrypoint for the self-hosted single-process Lumo image.
#
# WHY THIS EXISTS: the app persists its SQLite DB on a bind-mounted host disk
# (LUMO_DATA_DIR → /data). That disk is usually a provider's block/cloud volume,
# and a freshly mounted volume is root-owned. The app runs unprivileged (the
# `node` user, uid 1000) and therefore can't create /data/lumo.db on a root-owned
# mount — libsql fails with `SQLITE_CANTOPEN (14)`.
#
# Relying on a host-side `chown` (bootstrap.sh) is fragile: it only helps if the
# disk was already mounted when bootstrap ran, and it is never re-applied on later
# deploys or after a remount. So instead the container fixes its own data dir:
# this script starts as root, makes the data + log dirs writable by the app user,
# then DROPS privileges with `gosu` and execs the app unprivileged. Ownership is
# only touched when it's actually wrong, so normal restarts are a no-op.
#
# Escape hatch: if your volume is on a network filesystem that enforces a fixed
# owner (chown is refused), set LUMO_UID / LUMO_GID to that owner so the app runs
# as the uid/gid the disk already grants.
set -eu

APP_UID="${LUMO_UID:-1000}"
APP_GID="${LUMO_GID:-1000}"

# Derive the data dir from the DB path the app will actually open. In Turso
# (direct-cloud) mode LUMO_DB_PATH may be unset — /data is still bind-mounted, so
# fall back to it and keep it writable anyway (harmless, and covers a later switch
# back to local mode).
DB_PATH="${LUMO_DB_PATH:-/data/lumo.db}"
DATA_DIR="$(dirname "$DB_PATH")"
LOG_DIR="/var/log/lumo"

log() { printf 'entrypoint: %s\n' "$*"; }

# Make $1 writable by APP_UID:APP_GID, but only chown when it isn't already —
# a recursive chown of a large backups/ dir on every boot would be wasteful.
ensure_writable() {
  dir="$1"
  [ -n "$dir" ] || return 0
  mkdir -p "$dir" 2>/dev/null || true
  [ -d "$dir" ] || return 0
  if gosu "${APP_UID}:${APP_GID}" test -w "$dir" 2>/dev/null; then
    return 0
  fi
  log "$dir is not writable by ${APP_UID}:${APP_GID} — taking ownership…"
  if ! chown -R "${APP_UID}:${APP_GID}" "$dir" 2>/dev/null; then
    log "WARNING: could not chown $dir (network filesystem?). If the app still"
    log "         can't write, set LUMO_UID/LUMO_GID to the owner the disk enforces."
  fi
}

# Only the root entrypoint can fix ownership + drop privileges. If the operator
# already pinned a non-root user (compose `user:`), just run the command as-is.
if [ "$(id -u)" = "0" ]; then
  ensure_writable "$DATA_DIR"
  ensure_writable "$LOG_DIR"
  exec gosu "${APP_UID}:${APP_GID}" "$@"
fi

exec "$@"
