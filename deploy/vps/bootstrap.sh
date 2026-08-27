#!/usr/bin/env bash
# One-time setup for a fresh VPS running the self-hosted single-process Lumo.
# Idempotent: safe to re-run. After this, deploys happen via GitHub Actions
# (.github/workflows/deploy-vps.yml) — this only prepares the box.
#
# Usage (as a sudo-capable user):
#   curl -fsSL https://raw.githubusercontent.com/lumoryxr/lumo-task-web/main/deploy/vps/bootstrap.sh | bash
# or, from a checkout:
#   bash deploy/vps/bootstrap.sh
#
# What it does:
#   1. Installs Docker Engine + compose plugin (skips if already present).
#   2. Creates the SQLite data dir on your mounted disk and chowns it to uid 1000
#      (the container's `node` user) so the app can write the DB.
#   3. Clones/updates the repo to /opt/lumo (provides compose + Caddyfile).
#   4. Creates deploy/vps/.env from the example and stops for you to fill it in.
#   5. Reminds you to `docker login ghcr.io` and how to bring the stack up.
#
# See docs/ops/vps-deployment.md for the full walkthrough.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/lumoryxr/lumo-task-web.git}"
APP_DIR="${APP_DIR:-/opt/lumo}"
# Host path where your provider's block/cloud disk is mounted. MUST match
# LUMO_DATA_DIR in deploy/vps/.env.
DATA_DIR="${LUMO_DATA_DIR:-/mnt/lumo-data}"
# The container runs as the base image's `node` user (uid/gid 1000).
APP_UID=1000
APP_GID=1000

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!  \033[0m %s\n' "$*"; }

require_sudo() {
  if [ "$(id -u)" -ne 0 ] && ! command -v sudo >/dev/null 2>&1; then
    warn "Run as root or install sudo."; exit 1
  fi
}
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"

# 1. Docker ────────────────────────────────────────────────────────────────────
install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker + compose already installed — skipping."
    return
  fi
  log "Installing Docker Engine + compose plugin…"
  curl -fsSL https://get.docker.com | $SUDO sh
  # Let the current non-root user run docker without sudo (takes effect on next login).
  if [ "$(id -u)" -ne 0 ]; then
    $SUDO usermod -aG docker "$USER" || true
    warn "Added $USER to the 'docker' group — log out/in (or 'newgrp docker') for it to apply."
  fi
}

# 1b. Backup tooling ─────────────────────────────────────────────────────────────
install_backup_deps() {
  # `backup.sh` uses `sqlite3 .backup` for a consistent online snapshot. It also
  # uses `gzip` + `find` (busybox-utils on Debian). Cron is the scheduler.
  # Close §3.2 of docs/business/commercial-plan-post-launch.md: without these
  # installed, the on-box backup path silently does nothing (see that doc).
  local missing=()
  command -v sqlite3   >/dev/null 2>&1 || missing+=("sqlite3")
  command -v gzip      >/dev/null 2>&1 || missing+=("gzip")
  command -v crontab   >/dev/null 2>&1 || missing+=("cron")
  if [ "${#missing[@]}" -gt 0 ]; then
    log "Installing backup tooling: ${missing[*]}…"
    if command -v apt-get >/dev/null 2>&1; then
      $SUDO apt-get update -y
      $SUDO apt-get install -y --no-install-recommends "${missing[@]}"
    elif command -v dnf >/dev/null 2>&1; then
      $SUDO dnf install -y "${missing[@]}"
    elif command -v yum >/dev/null 2>&1; then
      $SUDO yum install -y "${missing[@]}"
    else
      warn "No known package manager found. Please install ${missing[*]} manually before relying on backup.sh."
    fi
  else
    log "Backup tooling already present (sqlite3, gzip, cron)."
  fi
}

# 1c. Backup schedule ───────────────────────────────────────────────────────────
install_backup_cron() {
  # Daily 03:15 (off-peak) — see deploy/vps/backup.sh for the cron example.
  # Idempotent: re-runs of bootstrap.sh rewrite the same line.
  local marker="# lumo: nightly sqlite backup (added by bootstrap.sh — do not edit)"
  local line="15 3 * * * /opt/lumo/deploy/vps/backup.sh >> /var/log/lumo/backup.log 2>&1"
  local tmp
  tmp="$(mktemp)"
  # Strip any previous entry we wrote (so the schedule stays ours), then append.
  ( crontab -l 2>/dev/null | grep -vF "$marker" || true ) > "$tmp"
  printf '%s\n%s\n' "$marker" "$line" >> "$tmp"
  if crontab "$tmp"; then
    log "Installed nightly backup cron (03:15) → /var/log/lumo/backup.log."
  else
    warn "Failed to install backup cron. Run \`crontab -l\` to inspect, or add the line manually."
  fi
  rm -f "$tmp"
}

# 2. Data disk ──────────────────────────────────────────────────────────────────
prepare_data_dir() {
  log "Preparing SQLite data dir at $DATA_DIR (owner ${APP_UID}:${APP_GID})…"
  if ! mountpoint -q "$DATA_DIR" 2>/dev/null; then
    warn "$DATA_DIR is not a separate mountpoint. That's fine for a first test, but"
    warn "for real persistence mount your provider's block/cloud disk there first."
  fi
  $SUDO mkdir -p "$DATA_DIR/backups"
  # The container's node user (1000) must own this to write /data/lumo.db. This is
  # a best-effort fast path only — the container entrypoint also self-heals the
  # ownership at startup, so DON'T let a chown failure (e.g. a network filesystem
  # that refuses chown) abort the whole bootstrap under `set -e`.
  if ! $SUDO chown -R "${APP_UID}:${APP_GID}" "$DATA_DIR" 2>/dev/null; then
    warn "Could not chown $DATA_DIR to ${APP_UID}:${APP_GID} (network disk?)."
    warn "The container will retry this itself on startup. If it still can't write,"
    warn "set LUMO_UID/LUMO_GID in .env to the owner the disk enforces."
  fi
}

# 3. Repo checkout ───────────────────────────────────────────────────────────────
clone_repo() {
  if [ -d "$APP_DIR/.git" ]; then
    log "Updating existing checkout at $APP_DIR…"
    $SUDO git -C "$APP_DIR" fetch --depth 1 origin main
    $SUDO git -C "$APP_DIR" reset --hard origin/main
  else
    log "Cloning $REPO_URL → $APP_DIR…"
    $SUDO mkdir -p "$APP_DIR"
    $SUDO chown "$(id -u):$(id -g)" "$APP_DIR"
    git clone --depth 1 "$REPO_URL" "$APP_DIR"
  fi
}

# 4. .env ────────────────────────────────────────────────────────────────────────
prepare_env() {
  local env_file="$APP_DIR/deploy/vps/.env"
  if [ -f "$env_file" ]; then
    log ".env already exists — leaving it untouched."
    return
  fi
  log "Creating $env_file from the example…"
  $SUDO cp "$APP_DIR/deploy/vps/.env.example" "$env_file"
  $SUDO chown "$(id -u):$(id -g)" "$env_file"
  chmod 600 "$env_file"
  cat <<EOF

  Next: edit $env_file and set at least:
    LUMO_DOMAIN         your domain (e.g. yourname.duckdns.org)
    LUMO_APP_BASE_URL   https://<that domain>
    LUMO_DATA_DIR       $DATA_DIR   (must match this box)
    LUMO_JWT_SECRET     $(openssl rand -hex 32 2>/dev/null || echo '<openssl rand -hex 32>')
    LUMO_ENCRYPTION_KEY $(openssl rand -hex 32 2>/dev/null || echo '<openssl rand -hex 32>')
    LUMO_ADMIN_EMAILS   your admin email (to see the feedback triage panel)

EOF
}

# 0. Log dir ───────────────────────────────────────────────────────────────────────────
ensure_log_dir() {
  # The cron entry writes to /var/log/lumo/backup.log. Create the dir up-front
  # so the first 03:15 doesn't silently fail on a missing parent. Mode 755 so
  # root can write and the deploy user can read for inspection.
  $SUDO mkdir -p /var/log/lumo
  $SUDO chmod 755 /var/log/lumo
}

main() {
  require_sudo
  ensure_log_dir
  install_docker
  install_backup_deps
  install_backup_cron
  prepare_data_dir
  clone_repo
  prepare_env
  cat <<EOF
$(log "Bootstrap complete.")

  Finish setup:
    1. Fill in $APP_DIR/deploy/vps/.env  (see above).
    2. Log in to GHCR so the box can pull the image:
         docker login ghcr.io           # username = your GitHub user, password = a read:packages PAT
       (or make the ghcr.io/lumoryxr/lumo-task-web package public — then skip this.)
    3. Point LUMO_DOMAIN's DNS A record at this server's IP, open ports 80 + 443.
    4. Bring it up:
         cd $APP_DIR/deploy/vps
         docker compose -f docker-compose.prod.yml up -d
    5. Add repo secrets VPS_HOST (host or host:port) / VPS_USER / VPS_PASSWORD
       so pushes auto-deploy.
    6. Backups: a nightly 03:15 cron was installed (writes to
       /var/log/lumo/backup.log). Confirm with `crontab -l` after login.
       For off-box durability install rclone and set RCLONE_REMOTE in .env
       (e.g. `RCLONE_REMOTE=r2:lumo-backups` — see docs/ops/vps-deployment.md).
       Do a one-time restore drill now: run `bash deploy/vps/backup.sh` and
       then verify the produced `lumo-*.db.gz` opens with sqlite3 (gunzip + open
       in a throwaway container). An unverified backup is not a backup.

  Full guide: docs/ops/vps-deployment.md
EOF
}

main "$@"
