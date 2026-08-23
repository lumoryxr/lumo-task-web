# -----------------------------------------------------------------------
# Lumo Task -- top-level Makefile
#
# Usage:
#   make            ->  install deps (if needed) + start dev server
#   make <target>   ->  run specific target  (see `make help`)
#
# Requires: Node 20+, npm, git, gh (GitHub CLI)
# -----------------------------------------------------------------------

APP       := web-app
BACKEND   := backend
CONTRACTS := packages/contracts

.DEFAULT_GOAL := dev
.PHONY: dev install build preview typecheck lint ci clean reset \
        backend-install backend-build backend-dev backend-migrate backend-seed \
        backend-ci contracts-build contracts-ci web-test openapi-check \
        dev-full package-win package-web \
        test-integration test-integration-backend test-integration-web test-integration-electron \
        help

# Sentinel files: rebuild when package-lock.json changes.
$(APP)/node_modules: $(APP)/package-lock.json
	@echo ">>> Installing web-app dependencies..."
	cd $(APP) && npm ci
	@touch $(APP)/node_modules

$(BACKEND)/node_modules: $(BACKEND)/package-lock.json
	@echo ">>> Installing backend dependencies..."
	cd $(BACKEND) && npm ci
	@touch $(BACKEND)/node_modules

$(CONTRACTS)/node_modules: $(CONTRACTS)/package-lock.json
	@echo ">>> Installing @lumo/contracts dependencies..."
	cd $(CONTRACTS) && npm ci
	@touch $(CONTRACTS)/node_modules

# -----------------------------------------------------------------------
# Development
# -----------------------------------------------------------------------

dev: $(APP)/node_modules   ## Start dev server at http://localhost:5173  [DEFAULT]
	@echo ">>> Starting dev server at http://localhost:5173"
	cd $(APP) && npm run dev

install:                   ## Install / refresh dependencies
	cd $(APP) && npm install

preview: build             ## Preview the production build locally
	cd $(APP) && npm run preview

# -----------------------------------------------------------------------
# Quality checks
# -----------------------------------------------------------------------

typecheck: $(APP)/node_modules contracts-build   ## TypeScript type check (tsc --noEmit)
	cd $(APP) && npm run typecheck

lint: $(APP)/node_modules        ## ESLint
	cd $(APP) && npm run lint

build: $(APP)/node_modules contracts-build       ## Production build (tsc -b + vite build)
	cd $(APP) && npm run build

# Contract package (single source of truth) — build its dist before anything
# that imports @lumo/contracts (backend + web-app typecheck/build).
contracts-build: $(CONTRACTS)/node_modules        ## Build @lumo/contracts → dist
	cd $(CONTRACTS) && npm run build

contracts-ci: $(CONTRACTS)/node_modules           ## Typecheck + test + build the contract package
	cd $(CONTRACTS) && npm run typecheck && npm test && npm run build

backend-ci: $(BACKEND)/node_modules contracts-build  ## Backend typecheck + unit + security + standards (incl. contract conformance)
	cd $(BACKEND) && npm run typecheck && npm run test:coverage && npm run test:security && npm run test:standards

# Frontend unit/standards tests (Vitest) — separate from Playwright E2E.
web-test: $(APP)/node_modules contracts-build   ## Frontend unit + standards tests (Vitest)
	cd $(APP) && npm test

# The committed OpenAPI document must match what the route registry generates.
# It is regenerated here and the working tree checked: a contract change that
# skipped `npm run gen:openapi` leaves docs/api/openapi.json behind, and this is
# what says so — otherwise the committed spec silently drifts from the served
# one, which is the exact failure the registry exists to prevent.
openapi-check: $(CONTRACTS)/node_modules contracts-build   ## Fail if docs/api/openapi.json is stale
	@echo ">>> Checking the generated OpenAPI document is up to date..."
	@cd $(CONTRACTS) && npm run --silent gen:openapi
	@git diff --exit-code -- docs/api/openapi.json || ( \
	  echo ""; \
	  echo "ERROR: docs/api/openapi.json is out of date."; \
	  echo "       Run: npm run gen:openapi -w @lumo/contracts   and commit the result."; \
	  exit 1 )

# Full gate: contract → backend → frontend. Catches front/back protocol drift.
ci: contracts-ci openapi-check backend-ci typecheck lint web-test build   ## Run all CI checks locally (mirrors GitHub Actions)
	@echo ""
	@echo ">>> All CI checks passed (contracts + backend + web-app)."

# -----------------------------------------------------------------------
# Backend
# -----------------------------------------------------------------------

backend-install: $(BACKEND)/node_modules   ## Install backend dependencies

backend-build: $(BACKEND)/node_modules contracts-build  ## Compile backend TypeScript → backend/dist/
	@echo ">>> Building backend..."
	cd $(BACKEND) && npm run build
	@echo ">>> Backend built."

backend-dev: $(BACKEND)/node_modules       ## Run backend in dev mode (tsx watch, port 47291)
	cd $(BACKEND) && LUMO_JWT_SECRET=local-dev-secret-not-for-production-0123456789 LUMO_ENCRYPTION_KEY=local-dev-encryption-key-not-for-production-0123 npm run dev

backend-migrate: $(BACKEND)/node_modules   ## Run DB migrations (creates lumo.db in backend/)
	cd $(BACKEND) && npm run migrate

backend-seed: $(BACKEND)/node_modules      ## Seed DB with demo data
	cd $(BACKEND) && npm run seed

dev-full: $(APP)/node_modules $(BACKEND)/node_modules   ## Run frontend + backend concurrently
	@echo ">>> Starting frontend (5173) and backend (47291) together..."
	@trap 'kill 0' INT TERM EXIT; \
	 ( cd $(BACKEND) && LUMO_JWT_SECRET=local-dev-secret-not-for-production-0123456789 LUMO_ENCRYPTION_KEY=local-dev-encryption-key-not-for-production-0123 npm run dev ) & \
	 ( cd $(APP) && npm run dev ) & \
	 wait

# -----------------------------------------------------------------------
# Integration tests  (real API + Playwright)
# -----------------------------------------------------------------------

test-integration: $(APP)/node_modules $(BACKEND)/node_modules   ## Run all integration test suites (backend + web + electron)
	@echo ">>> Running all integration test suites..."
ifeq ($(OS),Windows_NT)
	powershell -ExecutionPolicy Bypass -File scripts/test-integration.ps1
else
	bash scripts/test-integration.sh
endif

test-integration-backend: $(BACKEND)/node_modules               ## Backend real-API integration tests only
ifeq ($(OS),Windows_NT)
	powershell -ExecutionPolicy Bypass -File scripts/test-integration.ps1 -Suite backend -SkipBuild
else
	bash scripts/test-integration.sh backend --skip-build
endif

test-integration-dfx: $(BACKEND)/node_modules                   ## DFX (Design-for-X) integration tests only
ifeq ($(OS),Windows_NT)
	powershell -ExecutionPolicy Bypass -File scripts/test-integration.ps1 -Suite dfx -SkipBuild
else
	bash scripts/test-integration.sh dfx --skip-build
endif

test-integration-web: $(APP)/node_modules $(BACKEND)/node_modules  ## Web UI integration tests only (real backend)
ifeq ($(OS),Windows_NT)
	powershell -ExecutionPolicy Bypass -File scripts/test-integration.ps1 -Suite web -SkipBuild
else
	bash scripts/test-integration.sh web --skip-build
endif

test-integration-electron: $(APP)/node_modules                  ## Windows Electron UI tests only
ifeq ($(OS),Windows_NT)
	powershell -ExecutionPolicy Bypass -File scripts/test-integration.ps1 -Suite electron -SkipBuild
else
	bash scripts/test-integration.sh electron --skip-build
endif

# -----------------------------------------------------------------------
# Desktop packaging
# -----------------------------------------------------------------------

package-win: $(APP)/node_modules backend-build build   ## Build backend + frontend, package Windows installer
	@echo ">>> Packaging for Windows (x64)..."
	cd $(APP) && npx electron-builder --win --x64 --config.directories.output="$(CURDIR)/$(APP)/dist-electron"
	@echo ">>> Done. Installer is in $(APP)/dist-electron/"

package-web: $(APP)/node_modules $(BACKEND)/node_modules   ## Assemble the local/LAN web package → dist-web/ (run on target platform for correct native binaries; ship via the Windows CI workflow)
	@echo ">>> Assembling local/LAN web package..."
	node scripts/package-web.mjs --out "$(CURDIR)/dist-web/LumoTask-Web"
	@echo ">>> Done. Folder is in dist-web/. Add node.exe (Windows x64) and zip to ship."

# -----------------------------------------------------------------------
# Maintenance
# -----------------------------------------------------------------------

clean:   ## Remove node_modules and dist artifacts
	rm -rf $(APP)/node_modules $(APP)/dist $(APP)/dist-electron
	rm -rf $(BACKEND)/node_modules $(BACKEND)/dist
	@echo ">>> Cleaned."

reset:   ## Print the localStorage commands to reset demo data
	@echo ""
	@echo "Open the browser console (F12) and paste:"
	@echo "  localStorage.removeItem('lumo.tasks.v1')"
	@echo "  localStorage.removeItem('lumo.auth.v1')"
	@echo "  location.reload()"
	@echo ""

# -----------------------------------------------------------------------
# Help
# -----------------------------------------------------------------------

help:   ## Show this help
	@echo ""
	@echo "Usage:  make [target]"
	@echo ""
	@echo "Development:"
	@echo "  dev              Start frontend dev server at http://localhost:5173  [DEFAULT]"
	@echo "  install          Install / refresh web-app dependencies"
	@echo "  preview          Build then preview production bundle locally"
	@echo "  dev-full         Run frontend + backend together (concurrently)"
	@echo ""
	@echo "Backend:"
	@echo "  backend-install  Install backend npm dependencies"
	@echo "  backend-build    Compile backend TypeScript → backend/dist/"
	@echo "  backend-dev      Run backend in dev mode (tsx watch)"
	@echo "  backend-migrate  Run DB migrations"
	@echo "  backend-seed     Seed DB with demo data"
	@echo ""
	@echo "Quality:"
	@echo "  contracts-build  Build @lumo/contracts (shared API contract) → dist"
	@echo "  contracts-ci     Typecheck + test + build the contract package"
	@echo "  backend-ci       Backend typecheck + tests (incl. contract conformance)"
	@echo "  typecheck    TypeScript type check (tsc --noEmit)"
	@echo "  lint         ESLint"
	@echo "  build        Frontend production build"
	@echo "  ci           contracts + backend + web-app gate (mirrors CI)"
	@echo ""
	@echo "Integration tests (real API + Playwright):"
	@echo "  test-integration           All suites: backend + dfx + web + electron"
	@echo "  test-integration-backend   Backend real-API tests only"
	@echo "  test-integration-dfx       DFX (Design-for-X) integration tests only"
	@echo "  test-integration-web       Web UI tests with real backend"
	@echo "  test-integration-electron  Windows Electron UI tests"
	@echo ""
	@echo "Desktop:"
	@echo "  package-win  Build backend + frontend, package Windows installer → web-app/dist-electron/"
	@echo "  package-web  Assemble the local/LAN web package (single-process) → dist-web/"
	@echo ""
	@echo "Maintenance:"
	@echo "  clean        Remove node_modules and dist artifacts"
	@echo "  reset        Print commands to clear localStorage auth data"
	@echo ""
