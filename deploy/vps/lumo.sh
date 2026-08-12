#!/usr/bin/env bash
# lumo.sh — day-to-day maintenance CLI for the self-hosted single-VPS Lumo.
#
# A thin, memorable wrapper around `docker compose` so routine ops don't need the
# long `docker compose -f docker-compose.prod.yml …` incantation. Run it from
# anywhere — it cd's to its own directory (deploy/vps) and uses .env there.
#
# Usage:
#   deploy/vps/lumo.sh <command> [args]
#
# Commands:
#   start            Start the stack in the background (up -d).
#   stop             Stop the stack (containers stop; data + volumes are kept).
#   restart          Restart the app + proxy.
#   status | ps      Show container status and health.
#   logs [service]   Tail logs (all services, or one: app | caddy). Ctrl-C to exit.
#   update           Pull the latest image and recreate (routine deploy on the box).
#   backup           Take an on-box SQLite backup now (runs backup.sh).
#   fix-perms        Re-chown the data dir to the app user (uid 1000) — the manual
#                    version of the container's self-heal, run from the host.
#   shell [service]  Open a shell in a running container (default: app).
#   health           Curl the app's /health endpoint from inside the container.
#   config           Print the resolved compose config (sanity-check .env).
#   down             Stop AND remove containers (keeps named volumes + your data).
#
# Env overrides:
#   LUMO_COMPOSE_FILE   compose file to use (default docker-compose.prod.yml; use
#                       docker-compose.yml to build on the box instead of pulling).
set -euo pipefail

# Resolve to this script's directory so the command works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="${LUMO_COMPOSE_FILE:-docker-compose.prod.yml}"
APP_UID="${LUMO_UID:-1000}"
APP_GID="${LUMO_GID:-1000}"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!  \033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mx  \033[0m %s\n' "$*" >&2; exit 1; }

# `docker compose` (v2 plugin) with the fallback to the legacy `docker-compose`.
dc() {
  if docker compose version >/dev/null 2>&1; then
    docker compose -f "$COMPOSE_FILE" "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$COMPOSE_FILE" "$@"
  else
    die "docker compose is not installed. Run bootstrap.sh first."
  fi
}

require_env() {
  [ -f .env ] || die ".env not found in $SCRIPT_DIR. Run bootstrap.sh or create it from .env.example."
}

# Read LUMO_DATA_DIR from .env (used by fix-perms / backup), default /mnt/lumo-data.
data_dir() {
  local d
  d="$(grep -E '^LUMO_DATA_DIR=' .env 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
  printf '%s\n' "${d:-/mnt/lumo-data}"
}

cmd="${1:-}"
[ -n "$cmd" ] || { grep -E '^#( |$)' "$0" | sed -E 's/^# ?//'; exit 0; }
shift || true

case "$cmd" in
  start|up)
    require_env
    log "Starting the Lumo stack ($COMPOSE_FILE)…"
    dc up -d
    dc ps
    ;;

  stop)
    log "Stopping the Lumo stack (data + volumes kept)…"
    dc stop
    ;;

  restart)
    require_env
    log "Restarting the Lumo stack…"
    dc restart
    dc ps
    ;;

  status|ps)
    dc ps
    ;;

  logs)
    # Optional service name (app | caddy); default: all services.
    dc logs -f --tail=200 "$@"
    ;;

  update|deploy)
    require_env
    log "Pulling the latest image and recreating…"
    dc pull
    dc up -d
    docker image prune -f >/dev/null 2>&1 || true
    dc ps
    ;;

  backup)
    require_env
    log "Running on-box SQLite backup…"
    LUMO_DATA_DIR="$(data_dir)" bash "$SCRIPT_DIR/backup.sh"
    ;;

  fix-perms)
    local_dir="$(data_dir)"
    log "Re-chowning $local_dir to ${APP_UID}:${APP_GID} (the container's app user)…"
    SUDO=""; [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"
    $SUDO mkdir -p "$local_dir/backups"
    if $SUDO chown -R "${APP_UID}:${APP_GID}" "$local_dir"; then
      log "Done. Restart the app to pick it up: $0 restart"
    else
      die "chown failed. If this is a network disk that enforces an owner, set LUMO_UID/LUMO_GID in .env to that owner instead and re-run '$0 restart'."
    fi
    ;;

  shell|sh|exec)
    svc="${1:-app}"
    log "Opening a shell in '$svc'…"
    dc exec "$svc" sh -lc 'exec ${SHELL:-sh}' || dc exec "$svc" sh
    ;;

  health)
    log "Checking app health from inside the container…"
    if dc exec -T app node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>{console.log('health',r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(String(e));process.exit(1)})"; then
      log "Healthy."
    else
      die "App is NOT healthy. Check logs: $0 logs app"
    fi
    ;;

  config)
    dc config
    ;;

  down)
    warn "Removing containers (named volumes and your data disk are kept)."
    dc down
    ;;

  -h|--help|help)
    grep -E '^#( |$)' "$0" | sed -E 's/^# ?//'
    ;;

  *)
    die "Unknown command: '$cmd'. Run '$0 help' for usage."
    ;;
esac
