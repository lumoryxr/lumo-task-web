#!/usr/bin/env bash
#
# One-click integration test runner for Lumo Task (Unix/macOS/Linux).
#
# Usage:
#   ./scripts/test-integration.sh              # run all suites
#   ./scripts/test-integration.sh backend      # backend real-API only
#   ./scripts/test-integration.sh dfx          # DFX (Design-for-X) only
#   ./scripts/test-integration.sh web          # web UI only
#   ./scripts/test-integration.sh electron     # Electron only
#   ./scripts/test-integration.sh regression   # backend + dfx + web (daily headless lane)
#   ./scripts/test-integration.sh --skip-build web
#   ./scripts/test-integration.sh --open-report

set -euo pipefail

# ── parse args ────────────────────────────────────────────────────────────────
SUITE="all"
SKIP_BUILD=false
OPEN_REPORT=false

for arg in "$@"; do
  case "$arg" in
    backend|dfx|web|electron|all|regression) SUITE="$arg" ;;
    --skip-build) SKIP_BUILD=true ;;
    --open-report) OPEN_REPORT=true ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

# ── colours ───────────────────────────────────────────────────────────────────
CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; GRAY='\033[0;37m'; NC='\033[0m'
header() { echo -e "\n${CYAN}=== $1 ===${NC}"; }
ok()     { echo -e "  ${GREEN}v${NC} $1"; }
fail()   { echo -e "  ${RED}x${NC} $1"; }
info()   { echo -e "  ${GRAY}.${NC} $1"; }

# ── paths ─────────────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
WEBAPP="$ROOT/web-app"
TMP_DIR="${TMPDIR:-/tmp}"
BACKEND_DB="$TMP_DIR/lumo-backend-integration.db"
WEB_DB="$TMP_DIR/lumo-web-integration.db"

declare -A RESULTS

# ── prereqs ───────────────────────────────────────────────────────────────────
header "Prerequisites"

for tool in node npm; do
  command -v "$tool" >/dev/null 2>&1 || { fail "$tool not found in PATH"; exit 1; }
done

NODE_VER=$(node --version | sed 's/v//')
MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [[ $MAJOR -lt 22 ]]; then
  fail "Node 22+ required (found $NODE_VER)"; exit 1
fi
ok "Node $NODE_VER"

# ── install deps ──────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" == "false" ]]; then
  header "Installing dependencies"

  ( cd "$BACKEND" && npm ci --prefer-offline --silent )
  ok "backend"

  ( cd "$WEBAPP" && npm ci --prefer-offline --silent )
  ( cd "$WEBAPP" && npx playwright install chromium --with-deps 2>/dev/null || true )
  ok "web-app + Playwright browsers"
fi

# ── build ─────────────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" == "false" ]]; then
  header "Building"
  ( cd "$BACKEND" && npm run build )
  ok "backend"
  ( cd "$WEBAPP" && npm run build )
  ok "web-app"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Suite 1: Backend integration tests
# ═══════════════════════════════════════════════════════════════════════════════
run_backend() {
  header "Suite 1 — Backend real-API integration tests"
  rm -f "$BACKEND_DB"

  set +e
  ( cd "$BACKEND" && LUMO_DB_PATH="$BACKEND_DB" \
    node --env-file src/test/.env.integration --import tsx/esm --test src/test/integration.test.ts )
  CODE=$?
  set -e

  rm -f "$BACKEND_DB"

  if [[ $CODE -eq 0 ]]; then ok  "Backend integration: PASSED"
  else                        fail "Backend integration: FAILED (exit $CODE)"; fi
  RESULTS[backend]=$CODE
}

# ═══════════════════════════════════════════════════════════════════════════════
# Suite 1b: DFX (Design-for-X) integration tests — security/robustness/recovery/
#           observability/scalability/interoperability over real HTTP + SQLite.
# ═══════════════════════════════════════════════════════════════════════════════
DFX_DB="$TMP_DIR/lumo-dfx-integration.db"
run_dfx() {
  header "Suite 1b — DFX (Design-for-X) integration tests"
  rm -f "$DFX_DB"

  set +e
  ( cd "$BACKEND" && LUMO_DB_PATH="$DFX_DB" \
    node --env-file src/test/.env.integration --import tsx/esm --test src/test/dfx.integration.test.ts )
  CODE=$?
  set -e

  rm -f "$DFX_DB"

  if [[ $CODE -eq 0 ]]; then ok  "DFX integration: PASSED"
  else                        fail "DFX integration: FAILED (exit $CODE)"; fi
  RESULTS[dfx]=$CODE
}

# ═══════════════════════════════════════════════════════════════════════════════
# Suite 2: Web UI integration tests (real backend + Playwright)
# ═══════════════════════════════════════════════════════════════════════════════
run_web() {
  header "Suite 2 — Web UI integration tests (real backend)"
  rm -f "$WEB_DB"

  set +e
  ( cd "$WEBAPP" && LUMO_DB_PATH="$WEB_DB" \
    npx playwright test --config playwright.integration.config.ts )
  CODE=$?
  set -e

  rm -f "$WEB_DB"

  if [[ $CODE -eq 0 ]]; then
    ok "Web UI integration: PASSED"
    [[ "$OPEN_REPORT" == "true" ]] && \
      ( cd "$WEBAPP" && npx playwright show-report playwright-report-integration )
  else
    fail "Web UI integration: FAILED (exit $CODE)"
    info "Report: web-app/playwright-report-integration/index.html"
  fi
  RESULTS[web]=$CODE
}

# ═══════════════════════════════════════════════════════════════════════════════
# Suite 3: Electron UI tests
# ═══════════════════════════════════════════════════════════════════════════════
run_electron() {
  header "Suite 3 — Electron UI tests"

  if [[ ! -f "$WEBAPP/dist/index.html" ]]; then
    fail "web-app/dist/index.html not found — run without --skip-build first"
    RESULTS[electron]=1; return
  fi
  if [[ ! -f "$BACKEND/dist/bundle.cjs" ]]; then
    fail "backend/dist/bundle.cjs not found — run without --skip-build first"
    RESULTS[electron]=1; return
  fi

  set +e
  ( cd "$WEBAPP" && npx playwright test --config playwright.electron.config.ts )
  CODE=$?
  set -e

  if [[ $CODE -eq 0 ]]; then
    ok "Electron UI: PASSED"
    [[ "$OPEN_REPORT" == "true" ]] && \
      ( cd "$WEBAPP" && npx playwright show-report playwright-report-electron )
  else
    fail "Electron UI: FAILED (exit $CODE)"
    info "Report: web-app/playwright-report-electron/index.html"
  fi
  RESULTS[electron]=$CODE
}

# ── run selected suites ───────────────────────────────────────────────────────
# "regression" = the daily headless lane: backend + DFX + web (no Electron, which
# has its own per-PR smoke + daily Windows packaging job).
[[ "$SUITE" == "all" || "$SUITE" == "regression" || "$SUITE" == "backend"  ]] && run_backend
[[ "$SUITE" == "all" || "$SUITE" == "regression" || "$SUITE" == "dfx"      ]] && run_dfx
[[ "$SUITE" == "all" || "$SUITE" == "regression" || "$SUITE" == "web"      ]] && run_web
[[ "$SUITE" == "all" || "$SUITE" == "electron" ]] && run_electron

# ── summary ───────────────────────────────────────────────────────────────────
header "Summary"
ANY_FAILED=false
for key in "${!RESULTS[@]}"; do
  if [[ ${RESULTS[$key]} -eq 0 ]]; then ok  "$key"
  else                                  fail "$key"; ANY_FAILED=true; fi
done

if [[ "$ANY_FAILED" == "true" ]]; then
  echo -e "\n${RED}Some suites FAILED.${NC}"; exit 1
else
  echo -e "\n${GREEN}All integration suites PASSED.${NC}"; exit 0
fi
