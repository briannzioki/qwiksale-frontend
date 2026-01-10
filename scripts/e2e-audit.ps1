# scripts/e2e-audit.ps1
# Runs targeted failing specs, collects Playwright JSON, runs repo scan, writes .audit/report.md
# Usage examples are provided below this file in the instructions section.

[CmdletBinding()]
param(
  [string]$OutDir = ".audit",
  [switch]$Full,
  [switch]$SkipTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function New-Dir([string]$Path) {
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Write-TextFile([string]$Path, [string]$Content) {
  $dir = Split-Path -Parent $Path
  if ($dir) { New-Dir $dir }
  $Content | Out-File -FilePath $Path -Encoding utf8
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$OutAbs = (Resolve-Path (Join-Path $RepoRoot $OutDir) -ErrorAction SilentlyContinue)
if (-not $OutAbs) {
  New-Dir (Join-Path $RepoRoot $OutDir)
  $OutAbs = Resolve-Path (Join-Path $RepoRoot $OutDir)
}
$OutAbs = $OutAbs.Path

New-Dir $OutAbs

$meta = @()
$meta += "RepoRoot: $RepoRoot"
$meta += "Generated: $(Get-Date -Format o)"
$meta += "Node: $(node -v 2>$null)"
$meta += "PNPM: $(pnpm -v 2>$null)"
$meta += "Git: $((git rev-parse --abbrev-ref HEAD 2>$null) -join '')"
Write-TextFile (Join-Path $OutAbs "env.txt") ($meta -join "`r`n")

$pwJsonPath = Join-Path $OutAbs "playwright.json"

if (-not $SkipTests) {
  Write-Host "Running Playwright to capture failures into JSON..."

  if ($Full) {
    $cmd = "pnpm run test:e2e -- --workers=1 --reporter=json"
    Write-Host $cmd
    Invoke-Expression $cmd | Out-File -FilePath $pwJsonPath -Encoding utf8
  } else {
    $specs = @(
      "tests/e2e/admin-carriers-enforcement.spec.ts",
      "tests/e2e/carrier-onboarding.spec.ts",
      "tests/e2e/delivery-header-entry.spec.ts",
      "tests/e2e/delivery-product-entry.spec.ts",
      "tests/e2e/header-requests-drawer.spec.ts",
      "tests/e2e/requests.spec.ts",
      "tests/e2e/dashboard-auth.spec.ts"
    )

    $specArgsJoined = $specs -join " "
    $cmd = "pnpm exec playwright test $specArgsJoined --workers=1 --reporter=json"
    Write-Host $cmd
    Invoke-Expression $cmd | Out-File -FilePath $pwJsonPath -Encoding utf8
  }
} else {
  Write-Host "SkipTests was set. No Playwright run will be executed."
  if (-not (Test-Path $pwJsonPath)) {
    Write-Host "No existing playwright.json found in output dir. The scan will still run without test failures."
  }
}

Write-Host "Running repo audit scan..."
$scanCmd = "node scripts/repo-audit.mjs --out $OutDir --pw $($OutDir)/playwright.json"
Write-Host $scanCmd
Invoke-Expression $scanCmd | Out-File -FilePath (Join-Path $OutAbs "scan.log") -Encoding utf8

Write-Host ""
Write-Host "Done."
Write-Host "Open: $OutAbs\report.md"
