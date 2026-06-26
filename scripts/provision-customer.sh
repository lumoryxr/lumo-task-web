#!/usr/bin/env bash
#
# provision-customer.sh — stand up an isolated single-tenant environment for one
# B2B customer (ADR-0004: one environment = one backend + one database).
#
# It creates a dedicated Turso database for the customer, mints a scoped token,
# generates fresh per-environment secrets, and prints a ready-to-paste env block
# (and, with --render, a Render Blueprint rendered from the template). Each
# customer's data lives in its OWN database — isolation is the deployment
# boundary, never in-app routing.
#
# Usage:
#   scripts/provision-customer.sh <customer-slug> [--region <turso-region>] \
#       [--frontend-url <url>] [--render] [--dry-run]
#
#   <customer-slug>   lowercase letters, digits, hyphens (e.g. "acme", "globex-eu")
#   --region          Turso region (default: the org default; e.g. sin, fra, lax)
#   --frontend-url    the customer's frontend origin, used for CORS (LUMO_ALLOWED_ORIGINS)
#   --render          also render deploy/render.customer.template.yaml → stdout
#   --dry-run         print every step without creating anything (no Turso calls)
#
# Requirements: bash, openssl (or node), and — unless --dry-run — the Turso CLI
# (`turso`) authenticated against your organization (`turso auth login`).
#
# Secrets are generated locally and printed ONCE. Store them in your deploy
# platform's secret manager; this script never writes them to disk.

set -euo pipefail

# ── args ──────────────────────────────────────────────────────────────────────
SLUG=""
REGION=""
FRONTEND_URL=""
DO_RENDER=0
DRY_RUN=0

die() { echo "error: $*" >&2; exit 1; }

usage() { sed -n '/^# Usage:/,/never writes them to disk\.$/p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    # Guard `shift 2`: if the flag is the last arg, error clearly instead of
    # letting `shift 2` fail and abort silently under `set -e`.
    --region)       [ $# -ge 2 ] || die "--region needs a value"; REGION="$2"; shift 2 ;;
    --frontend-url) [ $# -ge 2 ] || die "--frontend-url needs a value"; FRONTEND_URL="$2"; shift 2 ;;
    --render)       DO_RENDER=1; shift ;;
    --dry-run)      DRY_RUN=1; shift ;;
    -h|--help)      usage; exit 0 ;;
    --*)            die "unknown flag: $1" ;;
    *)              [ -z "$SLUG" ] && SLUG="$1" || die "unexpected arg: $1"; shift ;;
  esac
done

[ -n "$SLUG" ] || die "missing <customer-slug> (see --help)"
echo "$SLUG" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' \
  || die "slug must be lowercase letters/digits/hyphens, e.g. 'acme-eu'"

DB_NAME="lumo-task-${SLUG}"

# A blank LUMO_ALLOWED_ORIGINS means the backend will CORS-block the customer's
# browser frontend. Warn loudly rather than emit a silently-empty value.
[ -n "$FRONTEND_URL" ] || echo "warning: --frontend-url not set → LUMO_ALLOWED_ORIGINS will be empty (the frontend will be CORS-blocked until you set it)" >&2

# ── secret generation (>= 32 bytes; passes the backend's strong-secret policy) ─
gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  elif command -v node >/dev/null 2>&1; then
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  else
    die "need openssl or node to generate secrets"
  fi
}

JWT_SECRET="$(gen_secret)"
ENCRYPTION_KEY="$(gen_secret)"

# ── Turso database + token ────────────────────────────────────────────────────
if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] would create Turso DB: ${DB_NAME}${REGION:+ (region ${REGION})}" >&2
  DB_URL="libsql://${DB_NAME}-<org>.turso.io"
  DB_TOKEN="<dry-run-token>"
else
  command -v turso >/dev/null 2>&1 || die "turso CLI not found; install it or use --dry-run"
  # Idempotent: reuse the DB if it already exists.
  if turso db show "$DB_NAME" >/dev/null 2>&1; then
    echo "note: Turso DB '${DB_NAME}' already exists — reusing it" >&2
  else
    # shellcheck disable=SC2086 # REGION is intentionally word-split (flag + value or empty)
    turso db create "$DB_NAME" ${REGION:+--location "$REGION"} >&2
  fi
  DB_URL="$(turso db show --url "$DB_NAME")"
  DB_TOKEN="$(turso db tokens create "$DB_NAME")"
fi

# ── output: env block ─────────────────────────────────────────────────────────
cat <<ENV
# ─────────────────────────────────────────────────────────────────────────────
# Environment for customer: ${SLUG}   (database: ${DB_NAME})
# Single-tenant: this backend serves ONLY this customer. Set these on the
# customer's backend deployment. Secrets are shown ONCE — store them securely.
# ─────────────────────────────────────────────────────────────────────────────
NODE_ENV=production
LUMO_JWT_SECRET=${JWT_SECRET}
LUMO_ENCRYPTION_KEY=${ENCRYPTION_KEY}
TURSO_DATABASE_URL=${DB_URL}
TURSO_AUTH_TOKEN=${DB_TOKEN}
LUMO_ALLOWED_ORIGINS=${FRONTEND_URL}
# Frontend build var (set on the customer's static site):
#   VITE_API_BASE=<this backend's URL>/v1
# Desktop builds for THIS customer (if any) point at this backend:
#   LUMO_CLOUD_API_BASE=<this backend's origin>   # no /v1
ENV

# ── optional: render the Blueprint template ───────────────────────────────────
if [ "$DO_RENDER" -eq 1 ]; then
  TPL="$(dirname "$0")/../deploy/render.customer.template.yaml"
  [ -f "$TPL" ] || die "template not found: $TPL"
  echo ""
  echo "# ── rendered Render Blueprint (deploy/render.customer.template.yaml) ──"
  sed "s/{{SLUG}}/${SLUG}/g" "$TPL"
fi

echo "" >&2
echo "done: customer '${SLUG}' → DB '${DB_NAME}'. Paste the env block into the" >&2
echo "customer's backend deployment, set VITE_API_BASE on its frontend, deploy." >&2
