<#
.SYNOPSIS
    One-click integration test runner for Lumo Task (Windows).

.DESCRIPTION
    Runs the integration test suites in sequence:
      1.  Backend real-API tests     (Node.js test runner, real SQLite)
      1b. DFX (Design-for-X) tests   (security/robustness/recovery/scalability)
      2.  Web UI tests               (Playwright + real Hono backend)
      3.  Windows Electron UI tests  (Playwright _electron)

    Pass -Suite to run a single suite: backend | dfx | web | electron |
    regression (backend+dfx+web) | all (default)
    Pass -SkipBuild to skip the npm build steps (faster re-runs).
    Pass -OpenReport to open the HTML report after each suite.

.EXAMPLE
    .\scripts\test-integration.ps1
    .\scripts\test-integration.ps1 -Suite web
    .\scripts\test-integration.ps1 -Suite electron -SkipBuild
    .\scripts\test-integration.ps1 -OpenReport
#>

param(
    [ValidateSet("all", "backend", "dfx", "web", "electron", "regression")]
    [string]$Suite = "all",

    [switch]$SkipBuild,
    [switch]$OpenReport
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# -- colours ------------------------------------------------------------------
function Write-Header { param($msg) Write-Host "" ; Write-Host "=== $msg ===" -ForegroundColor Cyan }
function Write-Ok     { param($msg) Write-Host "  PASS  $msg" -ForegroundColor Green }
function Write-Fail   { param($msg) Write-Host "  FAIL  $msg" -ForegroundColor Red }
function Write-Info   { param($msg) Write-Host "  ...   $msg" -ForegroundColor Gray }

# -- paths --------------------------------------------------------------------
$Root    = Split-Path $PSScriptRoot -Parent
$Backend = Join-Path $Root "backend"
$WebApp  = Join-Path $Root "web-app"

$TempDir   = if ($env:TEMP) { $env:TEMP } else { "C:\Windows\Temp" }
$BackendDb = Join-Path $TempDir "lumo-backend-integration.db"
$DfxDb     = Join-Path $TempDir "lumo-dfx-integration.db"
$WebDb     = Join-Path $TempDir "lumo-web-integration.db"

# Use script-scope so functions can write results without pipeline interference
$script:Results = [ordered]@{}

# -- prereqs ------------------------------------------------------------------
Write-Header "Prerequisites"

foreach ($tool in @("node", "npm")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Fail "$tool not found in PATH"
        exit 1
    }
}

$nodeVer = (node --version) -replace "v", ""
$major   = [int]($nodeVer -split "\.")[0]
if ($major -lt 20) {
    Write-Fail "Node 20+ required (found $nodeVer)"
    exit 1
}
Write-Ok "Node $nodeVer"

# -- install deps (skipped when -SkipBuild to avoid clobbering in-use node_modules) --------
if (-not $SkipBuild) {
    Write-Header "Installing dependencies"

    Push-Location $Backend
    npm ci --prefer-offline --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "backend npm ci failed"
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Ok "backend"

    Push-Location $WebApp
    npm ci --prefer-offline --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "web-app npm ci failed"
        Pop-Location
        exit 1
    }
    npx playwright install chromium --with-deps 2>$null
    Pop-Location
    Write-Ok "web-app + Playwright browsers"
}

# -- build --------------------------------------------------------------------
if (-not $SkipBuild) {
    Write-Header "Building"

    Push-Location $Backend
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "backend build failed"
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Ok "backend"

    Push-Location $WebApp
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "web-app build failed"
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Ok "web-app"
}

# -----------------------------------------------------------------------------
# Suite 1: Backend integration tests
# -----------------------------------------------------------------------------
function Run-BackendSuite {
    Write-Header "Suite 1 -- Backend real-API integration tests"

    if (Test-Path $BackendDb) { Remove-Item $BackendDb -Force }

    Push-Location $Backend
    $env:LUMO_DB_PATH = $BackendDb
    node --env-file src/test/.env.integration --import tsx/esm --test src/test/integration.test.ts
    $ec = $LASTEXITCODE
    Remove-Item Env:\LUMO_DB_PATH -ErrorAction SilentlyContinue
    Pop-Location

    if (Test-Path $BackendDb) { Remove-Item $BackendDb -Force }

    if ($ec -eq 0) {
        Write-Ok "Backend integration: PASSED"
    } else {
        Write-Fail "Backend integration: FAILED (exit $ec)"
    }
    $script:Results["backend"] = $ec
}

# -----------------------------------------------------------------------------
# Suite 1b: DFX (Design-for-X) integration tests
# -----------------------------------------------------------------------------
function Run-DfxSuite {
    Write-Header "Suite 1b -- DFX (Design-for-X) integration tests"

    if (Test-Path $DfxDb) { Remove-Item $DfxDb -Force }

    Push-Location $Backend
    $env:LUMO_DB_PATH = $DfxDb
    node --env-file src/test/.env.integration --import tsx/esm --test src/test/dfx.integration.test.ts
    $ec = $LASTEXITCODE
    Remove-Item Env:\LUMO_DB_PATH -ErrorAction SilentlyContinue
    Pop-Location

    if (Test-Path $DfxDb) { Remove-Item $DfxDb -Force }

    if ($ec -eq 0) {
        Write-Ok "DFX integration: PASSED"
    } else {
        Write-Fail "DFX integration: FAILED (exit $ec)"
    }
    $script:Results["dfx"] = $ec
}

# -----------------------------------------------------------------------------
# Suite 2: Web UI integration tests (real backend + Playwright)
# -----------------------------------------------------------------------------
function Run-WebSuite {
    Write-Header "Suite 2 -- Web UI integration tests (real backend)"

    if (Test-Path $WebDb) { Remove-Item $WebDb -Force }

    Push-Location $WebApp
    $env:LUMO_DB_PATH = $WebDb
    npx playwright test --config playwright.integration.config.ts
    $ec = $LASTEXITCODE
    Remove-Item Env:\LUMO_DB_PATH -ErrorAction SilentlyContinue
    Pop-Location

    if (Test-Path $WebDb) { Remove-Item $WebDb -Force }

    if ($ec -eq 0) {
        Write-Ok "Web UI integration: PASSED"
        if ($OpenReport) {
            Push-Location $WebApp
            npx playwright show-report playwright-report-integration
            Pop-Location
        }
    } else {
        Write-Fail "Web UI integration: FAILED (exit $ec)"
        Write-Info "Report: web-app\playwright-report-integration\index.html"
    }
    $script:Results["web"] = $ec
}

# -----------------------------------------------------------------------------
# Suite 3: Electron (Windows) UI tests
# -----------------------------------------------------------------------------
function Run-ElectronSuite {
    Write-Header "Suite 3 -- Windows Electron UI tests"

    if (-not (Test-Path (Join-Path $WebApp "dist\index.html"))) {
        Write-Fail "web-app/dist/index.html not found -- run without -SkipBuild first"
        $script:Results["electron"] = 1
        return
    }
    if (-not (Test-Path (Join-Path $Backend "dist\bundle.cjs"))) {
        Write-Fail "backend/dist/bundle.cjs not found -- run without -SkipBuild first"
        $script:Results["electron"] = 1
        return
    }

    Push-Location $WebApp
    npx playwright test --config playwright.electron.config.ts
    $ec = $LASTEXITCODE
    Pop-Location

    if ($ec -eq 0) {
        Write-Ok "Electron UI: PASSED"
        if ($OpenReport) {
            Push-Location $WebApp
            npx playwright show-report playwright-report-electron
            Pop-Location
        }
    } else {
        Write-Fail "Electron UI: FAILED (exit $ec)"
        Write-Info "Report: web-app\playwright-report-electron\index.html"
    }
    $script:Results["electron"] = $ec
}

# -- run selected suites ------------------------------------------------------
if ($Suite -eq "all" -or $Suite -eq "regression" -or $Suite -eq "backend")  { Run-BackendSuite  }
if ($Suite -eq "all" -or $Suite -eq "regression" -or $Suite -eq "dfx")      { Run-DfxSuite      }
if ($Suite -eq "all" -or $Suite -eq "regression" -or $Suite -eq "web")      { Run-WebSuite      }
if ($Suite -eq "all" -or $Suite -eq "electron") { Run-ElectronSuite }

# -- summary ------------------------------------------------------------------
Write-Header "Summary"
$anyFailed = $false
foreach ($key in $script:Results.Keys) {
    if ($script:Results[$key] -eq 0) {
        Write-Ok $key
    } else {
        Write-Fail $key
        $anyFailed = $true
    }
}

if ($anyFailed) {
    Write-Host "" ; Write-Host "Some suites FAILED." -ForegroundColor Red
    exit 1
} else {
    Write-Host "" ; Write-Host "All integration suites PASSED." -ForegroundColor Green
    exit 0
}
