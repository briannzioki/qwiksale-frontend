# tools/verify-mpesa-wiring.ps1
# Compatible with Windows PowerShell 5.1 (no ?? operator)

$ErrorActionPreference = 'Stop'

function Write-Section($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Pass($t) { Write-Host "PASS $t" -ForegroundColor Green }
function Warn($t) { Write-Host "WARN $t" -ForegroundColor Yellow }
function Fail($t) { Write-Host "FAIL $t" -ForegroundColor Red }

function MaskSecret([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return "(missing)" }
  $v = $s.Trim()
  if ($v.Length -le 8) { return ("*" * $v.Length) }
  return ($v.Substring(0,4) + ("*" * ($v.Length - 6)) + $v.Substring($v.Length - 2))
}

function Get-RepoRoot {
  try {
    $inside = (git rev-parse --is-inside-work-tree 2>$null)
    if ($inside -eq "true") {
      return (git rev-parse --show-toplevel 2>$null).Trim()
    }
  } catch {}
  return (Get-Location).Path
}

function Get-FilesUnderSrc {
  param([string]$root)

  $src = Join-Path $root "src"
  if (-not (Test-Path $src)) { return @() }

  return Get-ChildItem -Path $src -Recurse -File -Include *.ts,*.tsx |
    Where-Object {
      $_.FullName -notmatch '\\node_modules\\' -and
      $_.FullName -notmatch '\\\.next\\' -and
      $_.FullName -notmatch '\\dist\\' -and
      $_.FullName -notmatch '\\build\\' -and
      $_.FullName -notmatch '\\coverage\\'
    }
}

function Convert-RouteFileToPath {
  param([string]$repoRoot, [string]$fullPath)

  $apiRoot = Join-Path $repoRoot "src\app\api"
  $apiRoot = [IO.Path]::GetFullPath($apiRoot)
  $fp = [IO.Path]::GetFullPath($fullPath)

  if ($fp -notlike "$apiRoot*") { return $null }

  $rel = $fp.Substring($apiRoot.Length).TrimStart('\','/')
  # Expect ".../route.ts" or ".../route.tsx"
  $rel = $rel -replace '[\\/]+route\.tsx?$', ''
  $rel = $rel -replace '\\', '/'

  if ([string]::IsNullOrWhiteSpace($rel)) { return "/api" }
  return "/api/$rel"
}

function Read-DotEnvVarFromFiles {
  param(
    [string]$repoRoot,
    [string]$key
  )

  $files = @(
    ".env.local",
    ".env",
    ".env.production",
    ".env.production.local",
    ".env.staging",
    ".env.staging.local",
    ".env.development",
    ".env.development.local",
    ".env.example"
  ) | ForEach-Object { Join-Path $repoRoot $_ } |
    Where-Object { Test-Path $_ }

  foreach ($f in $files) {
    $lines = Get-Content -LiteralPath $f -ErrorAction SilentlyContinue
    foreach ($ln in $lines) {
      $line = $ln.Trim()
      if ($line -like "#*") { continue }
      if ($line -match "^\s*$key\s*=\s*(.*)$") {
        $raw = $Matches[1]
        # remove surrounding quotes if present
        $val = $raw.Trim()
        if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
          $val = $val.Substring(1, $val.Length - 2)
        }
        return @{ file = $f; value = $raw; cleaned = $val }
      }
    }
  }
  return $null
}

function Get-EnvTrimmed {
  param([string]$key)
  $v = [Environment]::GetEnvironmentVariable($key)
  if ($null -eq $v) { return "" }
  return $v.Trim()
}

$root = Get-RepoRoot
Write-Host "Repo root: $root" -ForegroundColor DarkGray

# ----------------------------- ENV sanity ---------------------------------

Write-Section "M-Pesa env wiring (masked)"
$keys = @(
  "MPESA_ENV",
  "MPESA_BASE_URL",
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "MPESA_SHORT_CODE",
  "MPESA_PASSKEY",
  "MPESA_CALLBACK_URL",
  "NEXT_PUBLIC_TEST_MSISDN",
  "NEXT_PUBLIC_APP_URL"
)

$envTable = @()
foreach ($k in $keys) {
  $v = [Environment]::GetEnvironmentVariable($k)
  if ([string]::IsNullOrWhiteSpace($v)) {
    # try from .env* files (for diagnostics only)
    $fromFile = Read-DotEnvVarFromFiles -repoRoot $root -key $k
    if ($fromFile) {
      $v = $fromFile.cleaned
      $src = "file: " + (Split-Path -Leaf $fromFile.file)
    } else {
      $src = "env: (missing)"
      $v = ""
    }
  } else {
    $src = "env"
  }

  $shown = $v
  if ($k -match 'CONSUMER|SECRET|PASSKEY') { $shown = MaskSecret $v }
  if ($k -eq "NEXT_PUBLIC_TEST_MSISDN" -and $v) { $shown = MaskSecret $v }

  $envTable += [pscustomobject]@{ Key = $k; Value = $shown; Source = $src }
}

$envTable | Format-Table -AutoSize | Out-Host

# Required keys (non-public)
$required = @("MPESA_ENV","MPESA_BASE_URL","MPESA_SHORT_CODE","MPESA_CALLBACK_URL")
$missing = @()
foreach ($k in $required) {
  $vv = [Environment]::GetEnvironmentVariable($k)
  if ([string]::IsNullOrWhiteSpace($vv)) {
    $fromFile = Read-DotEnvVarFromFiles -repoRoot $root -key $k
    if (-not $fromFile -or [string]::IsNullOrWhiteSpace($fromFile.cleaned)) { $missing += $k }
  }
}
if ($missing.Count -gt 0) {
  Fail ("Missing required env vars: " + ($missing -join ", "))
} else {
  Pass "Required M-Pesa env vars exist (in env or .env files)."
}

# Validate MPESA_ENV + base URL consistency (PowerShell 5.1-safe)
$mpesaEnv = Get-EnvTrimmed "MPESA_ENV"
if (-not $mpesaEnv) {
  $fromFile = Read-DotEnvVarFromFiles -repoRoot $root -key "MPESA_ENV"
  if ($fromFile) { $mpesaEnv = $fromFile.cleaned.Trim() }
}

$mpesaBase = Get-EnvTrimmed "MPESA_BASE_URL"
if (-not $mpesaBase) {
  $fromFile = Read-DotEnvVarFromFiles -repoRoot $root -key "MPESA_BASE_URL"
  if ($fromFile) { $mpesaBase = $fromFile.cleaned.Trim() }
}

if ($mpesaEnv) {
  if ($mpesaEnv -notin @("sandbox","production")) {
    Warn "MPESA_ENV should be 'sandbox' or 'production' (found '$mpesaEnv')."
  } else {
    Pass "MPESA_ENV looks valid ($mpesaEnv)."
  }

  if ($mpesaBase) {
    if ($mpesaEnv -eq "sandbox" -and $mpesaBase -notmatch "sandbox\.safaricom\.co\.ke") {
      Warn "MPESA_ENV=sandbox but MPESA_BASE_URL does NOT look like sandbox.safaricom.co.ke"
    } elseif ($mpesaEnv -eq "production" -and $mpesaBase -notmatch "api\.safaricom\.co\.ke") {
      Warn "MPESA_ENV=production but MPESA_BASE_URL does NOT look like api.safaricom.co.ke"
    } else {
      Pass "MPESA_BASE_URL matches MPESA_ENV expectation."
    }
  }
}

# Validate callback URL ends with correct path and detect leading-space in .env
$cb = Get-EnvTrimmed "MPESA_CALLBACK_URL"
$cbFile = Read-DotEnvVarFromFiles -repoRoot $root -key "MPESA_CALLBACK_URL"
if (-not $cb -and $cbFile) { $cb = $cbFile.cleaned.Trim() }

if ($cb) {
  if ($cb -notmatch "/api/pay/mpesa/callback/?$") {
    Fail "MPESA_CALLBACK_URL should end with /api/pay/mpesa/callback (found: $cb)"
  } else {
    Pass "MPESA_CALLBACK_URL path looks correct."
  }

  if ($cbFile -and $cbFile.value -match "=\s+\S") {
    Warn "MPESA_CALLBACK_URL in $(Split-Path -Leaf $cbFile.file) has whitespace after '='. Remove it: MPESA_CALLBACK_URL=https://..."
  }
}

# ------------------------ Map where mpesa is used ---------------------------

Write-Section "Scan source: mpesa usage map"
$srcFiles = Get-FilesUnderSrc -root $root
if ($srcFiles.Count -eq 0) {
  Fail "Could not find src/*.ts(x) files."
  exit 1
}

$patterns = @(
  "mpesa",
  "daraja",
  "MPESA_",
  "STK",
  "stk",
  "Lipa",
  "CallBackURL",
  "CallbackURL",
  "/api/pay/mpesa"
)

$hits = @()
foreach ($p in $patterns) {
  $h = Select-String -Path ($srcFiles.FullName) -Pattern $p -SimpleMatch -ErrorAction SilentlyContinue
  if ($h) { $hits += $h }
}

if (-not $hits -or $hits.Count -eq 0) {
  Warn "No mpesa-related strings found in src/. If your mpesa code lives elsewhere, adjust the script."
} else {
  $byFile = $hits | Group-Object Path | Sort-Object Count -Descending
  Write-Host "Found mpesa-related references in $($byFile.Count) file(s):" -ForegroundColor DarkGray
  foreach ($g in $byFile) {
    Write-Host " - $($g.Name) ($($g.Count) hits)" -ForegroundColor Gray
  }
}

# --------------------------- Route existence --------------------------------

Write-Section "API route wiring checks"
$apiDir = Join-Path $root "src\app\api"
$apiRouteFiles = @()
if (Test-Path $apiDir) {
  $apiRouteFiles = Get-ChildItem -Path $apiDir -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^route\.tsx?$' }
}

if (-not $apiRouteFiles -or $apiRouteFiles.Count -eq 0) {
  Warn "No src/app/api/**/route.ts found (are you using pages router for API?)."
} else {
  $mpesaRoutes = $apiRouteFiles | Where-Object { $_.FullName -match '\\mpesa\\' }
  if (-not $mpesaRoutes -or $mpesaRoutes.Count -eq 0) {
    Warn "No API route files with 'mpesa' in the path were found under src/app/api."
  } else {
    Write-Host "M-Pesa route files:" -ForegroundColor DarkGray
    foreach ($rf in $mpesaRoutes) {
      $ep = Convert-RouteFileToPath -repoRoot $root -fullPath $rf.FullName
      Write-Host (" - " + $ep + "  <->  " + $rf.FullName.Replace($root + "\", "")) -ForegroundColor Gray
    }
  }

  # Callback route should exist
  $cbRoute = $apiRouteFiles | Where-Object {
    (Convert-RouteFileToPath -repoRoot $root -fullPath $_.FullName) -eq "/api/pay/mpesa/callback"
  }

  if (-not $cbRoute -or $cbRoute.Count -eq 0) {
    Fail "Missing callback route file for /api/pay/mpesa/callback (expected src/app/api/pay/mpesa/callback/route.ts)"
  } elseif ($cbRoute.Count -gt 1) {
    Fail "Multiple callback route files resolve to /api/pay/mpesa/callback. Keep exactly one."
    foreach ($f in $cbRoute) { Write-Host " - $($f.FullName)" -ForegroundColor Yellow }
  } else {
    Pass "Callback route file exists."
    $content = Get-Content -LiteralPath $cbRoute[0].FullName -Raw

    if ($content -notmatch 'export\s+async\s+function\s+POST\s*\(' -and $content -notmatch 'export\s+const\s+POST\s*=') {
      Warn "Callback route does NOT clearly export a POST handler. M-Pesa callbacks are normally POST."
    } else {
      Pass "Callback route exports POST handler."
    }

    if ($content -match 'req\.json\(' -or $content -match 'request\.json\(') {
      Pass "Callback route appears to parse JSON body."
    } else {
      Warn "Callback route does not obviously parse JSON body (double-check you handle Safaricom callback payload)."
    }
  }
}

# --------------------------- Middleware risk --------------------------------

Write-Section "Middleware check (do not block callback)"
$mw = Join-Path $root "src\middleware.ts"
if (Test-Path $mw) {
  $mwc = Get-Content -LiteralPath $mw -Raw
  if ($mwc -match 'matcher' -and $mwc -match '/api') {
    Warn "middleware.ts mentions '/api' in matcher. Ensure /api/pay/mpesa/callback is NOT protected/redirected."
  } else {
    Pass "No obvious /api matcher in middleware.ts."
  }

  if ($mwc -match 'mpesa' -or $mwc -match 'callback') {
    Warn "middleware.ts references mpesa/callback. Ensure it allows unauthenticated POST callbacks."
  }
} else {
  Write-Host "No src/middleware.ts found (skipping)." -ForegroundColor DarkGray
}

# ----------------------- Secrets in git-tracked files -----------------------

Write-Section "Secret leak check in tracked files"
try {
  $inside = (git rev-parse --is-inside-work-tree 2>$null)
  if ($inside -eq "true") {
    $leaks = git grep -n "MPESA_CONSUMER_KEY\s*=|MPESA_CONSUMER_SECRET\s*=|MPESA_PASSKEY\s*=" -- . 2>$null
    if ($leaks) {
      Fail "Found MPESA secrets in git-tracked files. Move them to env vars and remove from repo:"
      $leaks | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
    } else {
      Pass "No MPESA_* secret assignments found in git-tracked files."
    }
  } else {
    Write-Host "Not a git repo (skipping git-grep checks)." -ForegroundColor DarkGray
  }
} catch {
  Warn "Could not run git-grep secret check. (git not available?)"
}

# ------------------------ Hardcoded URL smell test --------------------------

Write-Section "Hardcoded URL checks (prefer env wiring)"
$hard = Select-String -Path ($srcFiles.FullName) -Pattern "sandbox\.safaricom\.co\.ke|api\.safaricom\.co\.ke|/api/pay/mpesa/callback" -AllMatches -ErrorAction SilentlyContinue
if ($hard) {
  Warn "Found hardcoded Safaricom/callback strings in src/ (prefer using env vars/constants). Occurrences:"
  $hard | Select-Object -First 40 | ForEach-Object {
    Write-Host (" - " + $_.Path.Replace($root + "\", "") + ":" + $_.LineNumber + "  " + $_.Line.Trim()) -ForegroundColor Yellow
  }
  if ($hard.Count -gt 40) { Write-Host " ... ($($hard.Count - 40) more)" -ForegroundColor DarkGray }
} else {
  Pass "No obvious hardcoded Safaricom/callback strings in src/."
}

Write-Section "Done"
Write-Host "Tip: Run this before switching sandbox -> production values." -ForegroundColor DarkGray
