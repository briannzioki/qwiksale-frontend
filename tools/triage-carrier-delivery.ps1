param(
  [string]$Root = (Get-Location).Path,
  [string]$OutDir = (Join-Path (Get-Location).Path "triage"),
  [switch]$OpenReport
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function New-Dir([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Write-Utf8([string]$Path, [string]$Text) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $utf8NoBom)
}

function Get-FileTextSafe([string]$Path) {
  try { return [System.IO.File]::ReadAllText($Path) } catch { return $null }
}

function Parse-DotEnvFile([string]$Path) {
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }

  $lines = Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue
  foreach ($line in ($lines | ForEach-Object { $_.Trim() })) {
    if (-not $line) { continue }
    if ($line.StartsWith("#")) { continue }

    $s = $line
    if ($s.StartsWith("export ")) { $s = $s.Substring(7).Trim() }

    $eq = $s.IndexOf("=")
    if ($eq -lt 1) { continue }

    $k = $s.Substring(0, $eq).Trim()
    $v = $s.Substring($eq + 1).Trim()

    # Remove wrapping quotes (common .env patterns)
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    }

    if ($k) { $map[$k] = $v }
  }

  return $map
}

function HostFromUrl([string]$Url) {
  if (-not $Url) { return $null }
  try {
    $u = [System.Uri]::new($Url)
    if ($u.Host) { return ($u.Host.ToLowerInvariant()) }
    return $null
  } catch {
    return $null
  }
}

function Select-RepoString {
  param(
    [string[]]$Patterns,
    [System.IO.FileInfo[]]$Files,
    [string]$Category
  )

  $results = New-Object System.Collections.Generic.List[object]

  foreach ($pat in $Patterns) {
    $hits = $Files | Select-String -Pattern $pat -AllMatches -SimpleMatch -ErrorAction SilentlyContinue

    foreach ($m in $hits) {
      $ctxBefore = @()
      $ctxAfter = @()

      try {
        $lines = Get-Content -LiteralPath $m.Path -ErrorAction Stop
        $i = [Math]::Max(0, $m.LineNumber - 3)
        $j = [Math]::Min($lines.Count - 1, $m.LineNumber + 1)

        if ($i -lt ($m.LineNumber - 1)) { $ctxBefore = $lines[$i..($m.LineNumber - 2)] }
        if ($m.LineNumber -lt $j) { $ctxAfter = $lines[$m.LineNumber..$j] }
      } catch {
        # ignore context errors
      }

      $results.Add([pscustomobject]@{
        Category   = $Category
        Pattern    = $pat
        File       = $m.Path
        LineNumber = $m.LineNumber
        Line       = $m.Line.TrimEnd()
        ContextUp  = ($ctxBefore -join "`n")
        ContextDn  = ($ctxAfter -join "`n")
      })
    }
  }

  return $results
}

function Get-ObjectKeysFromText([string]$Text) {
  if (-not $Text) { return @() }

  $rx = [regex]'(?m)(?:^|\s|[{,])\s*(?:"(?<k>[^"]+)"|''(?<k>[^'']+)''|(?<k>[A-Za-z_][A-Za-z0-9_]*))\s*:'
  $keys = New-Object System.Collections.Generic.HashSet[string]

  foreach ($m in $rx.Matches($Text)) {
    $k = $m.Groups["k"].Value
    if ($k -and $k.Length -le 60) { [void]$keys.Add($k) }
  }

  return $keys.ToArray() | Sort-Object
}

function Get-PlaywrightBaseUrlFromConfig([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $t = Get-FileTextSafe $Path
  if (-not $t) { return $null }

  # Heuristic only: looks for baseURL: "http://..."
  $rx = [regex]'baseURL\s*:\s*["''](?<u>https?://[^"'']+)["'']'
  $m = $rx.Match($t)
  if ($m.Success) { return $m.Groups["u"].Value }
  return $null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $OutDir "carrier-delivery-triage-$stamp"
New-Dir $OutDir
New-Dir $runDir

$excludeRegex = '\\(\.next|node_modules|dist|build|coverage|playwright-report|test-results)\\'

$allFiles = Get-ChildItem -Path $Root -Recurse -File -Force |
  Where-Object {
    $_.FullName -notmatch $excludeRegex -and
    $_.Length -lt 5242880
  }

# Key paths we expect in an auth-stable carrier/delivery repo
$keyPaths = @(
  "src/middleware.ts",
  "src/auth.ts",
  "src/auth.config.ts",
  "src/app/lib/auth.server.ts",
  "src/app/api/auth/[...nextauth]/route.ts",
  "src/app/signin/_components/CredentialsForm.client.tsx",
  "src/app/signin/_components/GoogleSignInButton.client.tsx",
  "src/app/api/me/route.ts",
  "src/app/api/carrier/register/route.ts",
  "src/app/api/carriers/near/route.ts",
  "src/app/api/delivery/requests/route.ts",
  "src/app/api/delivery/requests/[id]/route.ts",
  "src/app/product/[id]/ProductPageClient.tsx",
  "tests/e2e/admin-carriers-enforcement.spec.ts",
  "tests/e2e/carrier-onboarding.spec.ts",
  "tests/e2e/delivery-header-entry.spec.ts",
  "tests/e2e/delivery-product-entry.spec.ts",
  "tests/e2e/dashboard-no-500.spec.ts",
  "playwright.config.ts",
  ".env.local",
  ".env.e2e.local",
  ".github/workflows/ci.yml"
)

$keyStatus = foreach ($p in $keyPaths) {
  $full = Join-Path $Root $p
  [pscustomobject]@{
    Path   = $p
    Exists = (Test-Path -LiteralPath $full)
  }
}

$findings = New-Object System.Collections.Generic.List[object]

# 1) Auth drift and token parsing (should be disappearing)
$findings.AddRange((Select-RepoString -Category "auth-drift" -Patterns @(
  "getToken(",
  "next-auth/jwt",
  "secureCookie",
  "__Secure-next-auth",
  "__Host-next-auth",
  "next-auth.session-token",
  "authjs.session-token",
  "NEXTAUTH_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_BASE_URL",
  "NEXTAUTH_SECRET",
  "AUTH_SECRET",
  "AUTH_COOKIE_SECURE",
  "CORS_ALLOW_ORIGINS"
) -Files $allFiles))

# 2) Signin navigation alignment (redirect:false must navigate)
$findings.AddRange((Select-RepoString -Category "signin-redirect" -Patterns @(
  "redirect: false",
  "redirect:false",
  "signIn(",
  "router.replace",
  "router.push",
  "callbackUrl",
  "/signin"
) -Files $allFiles))

# 3) MissingCSRF / csrf wiring in signin + auth route
$findings.AddRange((Select-RepoString -Category "csrf-auth" -Patterns @(
  "MissingCSRF",
  "csrfToken",
  "getCsrfToken",
  "/api/auth/callback",
  "/api/auth/signin",
  "/api/auth/csrf",
  "XSRF",
  "csrf"
) -Files $allFiles))

# 4) Middleware wrapper + matcher exclusions
$findings.AddRange((Select-RepoString -Category "middleware" -Patterns @(
  "export default auth(",
  "req.auth",
  "matcher",
  "api/auth",
  "/api/auth",
  "sanitizeSigninCallbackValue",
  "callbackUrl"
) -Files $allFiles))

# 5) Carrier register schema + test payload references
$findings.AddRange((Select-RepoString -Category "carrier-register" -Patterns @(
  "/api/carrier/register",
  "station.lat",
  "station.lng",
  "stationLat",
  "stationLng",
  "lastSeenLat",
  "lastSeenLng",
  "suspendedUntil",
  "bannedAt",
  "bannedReason",
  "CarrierProfile",
  "CarrierStatus",
  "planTier",
  "verificationStatus"
) -Files $allFiles))

# 6) Product CTA / delivery link wiring
$findings.AddRange((Select-RepoString -Category "product-cta" -Patterns @(
  "Find carrier near this store",
  "/delivery?near=store",
  "near=store",
  "productId=",
  'href={"/delivery',
  'href="/delivery',
  'to="/delivery',
  'to={"/delivery'
) -Files $allFiles))

# 7) Worker / module-not-found suspects (source code only)
$findings.AddRange((Select-RepoString -Category "worker-crash" -Patterns @(
  "worker_threads",
  "new Worker",
  "worker.js",
  "MODULE_NOT_FOUND",
  "uncaughtException",
  "the worker thread exited"
) -Files $allFiles))

# 8) /api/me stability signals
$findings.AddRange((Select-RepoString -Category "api-me" -Patterns @(
  "/api/me",
  "export async function GET",
  "throw new Error",
  "ECONNRESET",
  "prisma"
) -Files $allFiles))

# Heuristic: compare keys used by tests vs keys expected by API carrier/register
$carrierApiPath = Join-Path $Root "src/app/api/carrier/register/route.ts"
$carrierApiText = Get-FileTextSafe $carrierApiPath
$carrierApiKeys = Get-ObjectKeysFromText $carrierApiText

$carrierTestFiles = @(
  "tests/e2e/admin-carriers-enforcement.spec.ts",
  "tests/e2e/carrier-onboarding.spec.ts",
  "tests/e2e/_helpers/prisma.ts"
) | ForEach-Object { Join-Path $Root $_ } | Where-Object { Test-Path -LiteralPath $_ }

$carrierTestText = ($carrierTestFiles | ForEach-Object { Get-FileTextSafe $_ }) -join "`n"
$carrierTestKeys = Get-ObjectKeysFromText $carrierTestText

# CSRF/signin heuristic: do we see csrfToken reference and is redirect:false paired with a navigation?
$credFormPath = Join-Path $Root "src/app/signin/_components/CredentialsForm.client.tsx"
$credText = Get-FileTextSafe $credFormPath

$credMentionsCsrf = $false
$credUsesRedirectFalse = $false
$credHasNavigation = $false

if ($credText) {
  $credMentionsCsrf = ($credText -match 'csrfToken') -or ($credText -match 'getCsrfToken')
  $credUsesRedirectFalse = ($credText -match 'redirect\s*:\s*false') -or ($credText -match 'redirect:false')
  $credHasNavigation = ($credText -match 'router\.replace') -or ($credText -match 'router\.push') -or ($credText -match 'window\.location')
}

# CTA heuristic: ensure CTA exists somewhere under product page client
$productClientPath = Join-Path $Root "src/app/product/[id]/ProductPageClient.tsx"
$productText = Get-FileTextSafe $productClientPath
$productHasCta = $false
if ($productText) {
  $productHasCta =
    ($productText -match [regex]::Escape("Find carrier near this store")) -or
    ($productText -match "/delivery\?near=store") -or
    ($productText -match "near=store")
}

# Env alignment heuristic
$envLocalPath = Join-Path $Root ".env.local"
$envE2EPath = Join-Path $Root ".env.e2e.local"
$envLocal = Parse-DotEnvFile $envLocalPath
$envE2E = Parse-DotEnvFile $envE2EPath

$localNextAuthUrl = $envLocal["NEXTAUTH_URL"]
$e2eNextAuthUrl = $envE2E["NEXTAUTH_URL"]

$localHost = HostFromUrl $localNextAuthUrl
$e2eHost = HostFromUrl $e2eNextAuthUrl

$localAuthSecret = $envLocal["AUTH_SECRET"]
$localNextAuthSecret = $envLocal["NEXTAUTH_SECRET"]
$e2eAuthSecret = $envE2E["AUTH_SECRET"]
$e2eNextAuthSecret = $envE2E["NEXTAUTH_SECRET"]

function EffectiveSecret([string]$a, [string]$b) {
  if ($a) { return $a }
  return $b
}

$localEffectiveSecret = EffectiveSecret $localAuthSecret $localNextAuthSecret
$e2eEffectiveSecret = EffectiveSecret $e2eAuthSecret $e2eNextAuthSecret

$localSecretsConflict = $false
if ($localAuthSecret -and $localNextAuthSecret -and ($localAuthSecret -ne $localNextAuthSecret)) { $localSecretsConflict = $true }

$e2eSecretsConflict = $false
if ($e2eAuthSecret -and $e2eNextAuthSecret -and ($e2eAuthSecret -ne $e2eNextAuthSecret)) { $e2eSecretsConflict = $true }

$crossSecretsMismatch = $false
if ($localEffectiveSecret -and $e2eEffectiveSecret -and ($localEffectiveSecret -ne $e2eEffectiveSecret)) { $crossSecretsMismatch = $true }

# Playwright baseURL heuristic
$pwConfigPath = Join-Path $Root "playwright.config.ts"
$pwBaseUrl = Get-PlaywrightBaseUrlFromConfig $pwConfigPath
$pwHost = HostFromUrl $pwBaseUrl

# Token parsing usage count (should trend to zero)
$getTokenCount = 0
foreach ($f in $allFiles) {
  try {
    $t = Get-FileTextSafe $f.FullName
    if ($t) {
      $getTokenCount += ([regex]::Matches($t, [regex]::Escape("getToken("))).Count
    }
  } catch {
    # ignore
  }
}

# .next crash check (we do NOT exclude .next for this one)
$nextWorkerPath = Join-Path $Root ".next\server\vendor-chunks\lib\worker.js"
$nextWorkerExists = Test-Path -LiteralPath $nextWorkerPath

$nextWorkers = @()
$nextVendorRoot = Join-Path $Root ".next\server\vendor-chunks"
if (Test-Path -LiteralPath $nextVendorRoot) {
  $nextWorkers = Get-ChildItem -Path $nextVendorRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ieq "worker.js" } |
    Select-Object FullName
}

$byCategory = $findings | Group-Object Category | Sort-Object Name

$summaryLines = New-Object System.Collections.Generic.List[string]
$summaryLines.Add("# Carrier + Delivery Triage Report")
$summaryLines.Add("")
$summaryLines.Add("Run: $stamp")
$summaryLines.Add("Root: $Root")
$summaryLines.Add("")
$summaryLines.Add("## Key file existence")
foreach ($k in $keyStatus) {
  $summaryLines.Add(("* {0} : {1}" -f $k.Path, ($(if ($k.Exists) { "OK" } else { "MISSING" }))))
}
$summaryLines.Add("")
$summaryLines.Add("## High-signal heuristics")
$summaryLines.Add(("* getToken( occurrences in repo (excluding node_modules/.next/etc): {0}" -f $getTokenCount))
$summaryLines.Add(("* Carrier register API keys (heuristic): {0}" -f (($carrierApiKeys -join ", "))))
$summaryLines.Add(("* Carrier tests payload keys (heuristic): {0}" -f (($carrierTestKeys -join ", "))))
$summaryLines.Add(("* Credentials form mentions csrf/csrfToken: {0}" -f ($(if ($credMentionsCsrf) { "YES" } else { "NO" }))))
$summaryLines.Add(("* Credentials form uses redirect:false: {0}" -f ($(if ($credUsesRedirectFalse) { "YES" } else { "NO" }))))
$summaryLines.Add(("* If redirect:false is used, form also navigates on success: {0}" -f ($(if (-not $credUsesRedirectFalse) { "N/A" } elseif ($credHasNavigation) { "YES" } else { "NO (likely stuck on /signin)" }))))
$summaryLines.Add(("* Product page includes Delivery CTA wiring: {0}" -f ($(if ($productHasCta) { "YES" } else { "NO (matches your delivery CTA tests)" }))))
$summaryLines.Add("")
$summaryLines.Add("## Env alignment (heuristic)")
$summaryLines.Add(("* .env.local NEXTAUTH_URL: {0}" -f ($(if ($localNextAuthUrl) { $localNextAuthUrl } else { "(missing)" }))))
$summaryLines.Add(("* .env.e2e.local NEXTAUTH_URL: {0}" -f ($(if ($e2eNextAuthUrl) { $e2eNextAuthUrl } else { "(missing)" }))))
$summaryLines.Add(("* NEXTAUTH_URL host match (local vs e2e): {0}" -f ($(if ($localHost -and $e2eHost -and ($localHost -eq $e2eHost)) { "YES ($localHost)" } else { "NO (local=$localHost, e2e=$e2eHost)" }))))
$summaryLines.Add(("* playwright.config.ts baseURL: {0}" -f ($(if ($pwBaseUrl) { $pwBaseUrl } else { "(not found)" }))))
$summaryLines.Add(("* baseURL host matches NEXTAUTH_URL (e2e): {0}" -f ($(if ($pwHost -and $e2eHost -and ($pwHost -eq $e2eHost)) { "YES ($pwHost)" } else { "NO (baseURL=$pwHost, e2e NEXTAUTH_URL=$e2eHost)" }))))
$summaryLines.Add(("* AUTH_SECRET vs NEXTAUTH_SECRET conflict in .env.local: {0}" -f ($(if ($localSecretsConflict) { "YES (they differ)" } else { "NO/Not both set" }))))
$summaryLines.Add(("* AUTH_SECRET vs NEXTAUTH_SECRET conflict in .env.e2e.local: {0}" -f ($(if ($e2eSecretsConflict) { "YES (they differ)" } else { "NO/Not both set" }))))
$summaryLines.Add(("* Effective secret match (local vs e2e): {0}" -f ($(if ($crossSecretsMismatch) { "NO (mismatch)" } else { "YES/Unknown (missing one side)" }))))
$summaryLines.Add("")
$summaryLines.Add(("* .next vendor worker exists at .next/server/vendor-chunks/lib/worker.js: {0}" -f ($(if ($nextWorkerExists) { "YES" } else { "NO (if tests mention this path, your build output is stale or failing)" }))))
$summaryLines.Add("")
if ($nextWorkers.Count -gt 0) {
  $summaryLines.Add("Worker.js files found under .next/server/vendor-chunks:")
  foreach ($w in $nextWorkers) { $summaryLines.Add(("* {0}" -f $w.FullName)) }
  $summaryLines.Add("")
}

$summaryLines.Add("## Match counts by category")
foreach ($g in $byCategory) {
  $summaryLines.Add(("* {0}: {1}" -f $g.Name, $g.Count))
}
$summaryLines.Add("")
$summaryLines.Add("## Detailed matches (with context)")
$summaryLines.Add("")

foreach ($g in $byCategory) {
  $summaryLines.Add(("### {0}" -f $g.Name))
  $summaryLines.Add("")
  foreach ($m in ($g.Group | Sort-Object File, LineNumber)) {
    $summaryLines.Add(("File: {0}:{1}" -f $m.File, $m.LineNumber))
    if ($m.ContextUp) { $summaryLines.Add($m.ContextUp) }
    $summaryLines.Add($m.Line)
    if ($m.ContextDn) { $summaryLines.Add($m.ContextDn) }
    $summaryLines.Add("")
  }
}

$reportPath = Join-Path $runDir "triage-report.md"
Write-Utf8 $reportPath ($summaryLines -join "`n")

$csvPath = Join-Path $runDir "triage-matches.csv"
$findings | Select-Object Category, Pattern, File, LineNumber, Line | Export-Csv -NoTypeInformation -Encoding UTF8 $csvPath

Write-Host ""
Write-Host "Triage report written:"
Write-Host "  $reportPath"
Write-Host "Raw matches CSV:"
Write-Host "  $csvPath"
Write-Host ""

if ($OpenReport) {
  Start-Process $reportPath
}
