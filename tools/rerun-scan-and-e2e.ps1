param(
  [string]$OutDir = "tools/_reports",
  [int]$Workers = 1,
  [ValidateSet("line","list","dot","github")]
  [string]$Reporter = "line",
  [switch]$RunFullSuite,
  [switch]$ForceFullSuite
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$OutFile = ("scan-and-rerun-{0}.txt" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force $OutDir | Out-Null
$fullOut = Join-Path (Get-Location).Path (Join-Path $OutDir $OutFile)

function Write-Report([string]$s) { Add-Content -LiteralPath $fullOut -Value $s -Encoding UTF8 }
function Write-Header([string]$t) { Write-Report ""; Write-Report ("=" * 110); Write-Report $t; Write-Report ("=" * 110) }
function Write-Sub([string]$t) { Write-Report ""; Write-Report ("-" * 110); Write-Report $t; Write-Report ("-" * 110) }

function ContextHits {
  param([string]$Path,[string]$Pattern,[int]$MaxHits=30,[int]$Before=2,[int]$After=3)
  $hits = @()
  try { $hits = @(Select-String -LiteralPath $Path -Pattern $Pattern -AllMatches -Context $Before,$After -ErrorAction SilentlyContinue) } catch { $hits = @() }
  if (-not $hits -or $hits.Count -eq 0) { Write-Report "  (no hits)"; return }
  $i = 0
  foreach ($h in $hits) {
    $i++; if ($i -gt $MaxHits) { Write-Report ("  (truncated; {0}+ hits)" -f $hits.Count); break }
    Write-Report ("  [Line {0}] {1}" -f $h.LineNumber, $h.Line.TrimEnd())
    foreach ($pl in $h.Context.PreContext)  { if ($pl) { Write-Report ("        (pre)  {0}" -f $pl.TrimEnd()) } }
    foreach ($pl in $h.Context.PostContext) { if ($pl) { Write-Report ("        (post) {0}" -f $pl.TrimEnd()) } }
  }
}

function Safe-ReadRaw([string]$Path) { try { Get-Content -LiteralPath $Path -Raw -ErrorAction Stop } catch { $null } }

# Build a cmd.exe-safe argument string (so we can redirect stderr->stdout at the OS level).
function Quote-CmdArg([string]$a) {
  if ($null -eq $a) { return '""' }
  if ($a -match '[\s"&^<>|()]') {
    return '"' + ($a -replace '"', '\"') + '"'
  }
  return $a
}

$RX_FEATURED_TESTID  = 'data-testid\s*=\s*["'']featured-tier-(basic|gold|diamond)["'']'
$RX_VERIFIED_TESTID  = 'data-testid\s*=\s*["''](verified-badge|unverified-badge)["'']'
$RX_TEST_TIER        = '(?i)(getByTestId|locator)\([^)]*featured-tier-(basic|gold|diamond)'
$RX_TEST_VER_TEXT    = '(?i)getByText\([^)]*(Verified|Unverified)'
$RX_HOME_LINK        = '(?i)(data-testid\s*=\s*["'']home-link["''])|(aria-label\s*=\s*["'']Home["''])|(\bhref\s*=\s*["'']\/["''])'
$RX_CLICK_HIJACK     = '(?i)\bpreventDefault\s*\(|\bstopPropagation\s*\(|\brouter\.(push|replace)\(\s*["'']\/["'']|\.addEventListener\(\s*["'']click["'']'
$RX_BADGE_FIELDS     = '(?i)\bsellerBadges\b|\bsellerFeaturedTier\b|\bsellerVerified\b|\bfeaturedTier\b|\bverified\b|\bisVerified\b|\bemail_verified\b|\bemailVerified\b'

$repoRoot = (Get-Location).Path

# NOTE: Exclude generated artifacts like playwright-report and our own _reports to avoid megadumps/noise.
$codeFiles = @(
  Get-ChildItem -Path "src","tests","tools" -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Extension -in ".ts",".tsx",".js",".jsx",".ps1" -and
      $_.FullName -notmatch '\\tests\\e2e\\playwright-report\\' -and
      $_.FullName -notmatch '\\tools\\_reports\\'
    } |
    Select-Object -ExpandProperty FullName
)

$failingSpecs = @(
  "tests/e2e/home-host.spec.ts",
  "tests/e2e/home-tabs.spec.ts",
  "tests/e2e/product-flow.spec.ts",
  "tests/e2e/store-flow.spec.ts"
)

Write-Header "QwikSale: broader static scan + rerun failing specs first"
Write-Report ("Generated: {0}" -f (Get-Date))
Write-Report ("Repo:      {0}" -f $repoRoot)
Write-Report ("Files:     {0}" -f $codeFiles.Count)
Write-Report ("Out:       {0}" -f $fullOut)
Write-Report ("Workers:   {0}" -f $Workers)
Write-Report ("Reporter:  {0}" -f $Reporter)

Write-Header "1) Scan: previously failing specs (context)"
foreach ($t in $failingSpecs) {
  Write-Report ""
  Write-Report ("FILE: {0}" -f $t)
  if (-not (Test-Path -LiteralPath $t)) { Write-Report "  !! missing"; continue }

  Write-Sub "  Tier assertions"
  ContextHits -Path $t -Pattern $RX_TEST_TIER -MaxHits 50

  Write-Sub "  Verified/Unverified text assertions"
  ContextHits -Path $t -Pattern $RX_TEST_VER_TEXT -MaxHits 50

  Write-Sub "  Home selectors"
  ContextHits -Path $t -Pattern '(?i)(getByRole\([^)]*link[^)]*(home|qwiksale|logo)|data-testid\s*=\s*["'']home-link["'']|aria-label\s*=\s*["'']Home["''])' -MaxHits 50
}

Write-Header "2) Scan: home link ownership + click hijack suspects"
$homeFiles = @()
try { $homeFiles += @(Select-String -Path $codeFiles -Pattern $RX_HOME_LINK -AllMatches -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path -Unique) } catch {}
$homeFiles = @($homeFiles | Sort-Object -Unique)

if ($homeFiles.Count -eq 0) {
  Write-Report "  (none found)"
} else {
  foreach ($p in $homeFiles) { Write-Report ("  {0}" -f $p) }
  Write-Sub "  Context: home/link patterns + hijack patterns"
  foreach ($p in $homeFiles) {
    Write-Report ""
    Write-Report ("FILE: {0}" -f $p)
    ContextHits -Path $p -Pattern $RX_HOME_LINK -MaxHits 20
    ContextHits -Path $p -Pattern $RX_CLICK_HIJACK -MaxHits 20
  }
}

Write-Header "3) Scan: badge coverage (rendered vs used)"
Write-Sub "  A) Where featured-tier-* testids are rendered"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_FEATURED_TESTID -AllMatches -ErrorAction SilentlyContinue
  if (-not $hits) { Write-Report "  (none found)" }
  else { foreach ($h in $hits) { Write-Report ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) } }
} catch { Write-Report "  (scan failed)" }

Write-Sub "  B) Where verified/unverified testids are rendered"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_VERIFIED_TESTID -AllMatches -ErrorAction SilentlyContinue
  if (-not $hits) { Write-Report "  (none found)" }
  else { foreach ($h in $hits) { Write-Report ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) } }
} catch { Write-Report "  (scan failed)" }

Write-Sub "  C) Files using badge fields but NOT rendering badge testids (prime suspects)"
$fieldFiles = @()
try { $fieldFiles = @(Select-String -Path $codeFiles -Pattern $RX_BADGE_FIELDS -AllMatches -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path -Unique) } catch { $fieldFiles = @() }

$prime = New-Object System.Collections.Generic.List[string]
foreach ($p in $fieldFiles) {
  $raw = Safe-ReadRaw $p
  if ($null -eq $raw) { continue }
  $hasAny = ($raw -match $RX_FEATURED_TESTID) -or ($raw -match $RX_VERIFIED_TESTID)
  if (-not $hasAny) { [void]$prime.Add($p) }
}
$prime = @($prime | Sort-Object -Unique)
if ($prime.Count -eq 0) { Write-Report "  (none)" } else { foreach ($p in $prime) { Write-Report ("  {0}" -f $p) } }

function Run-Playwright([string[]]$specs, [string]$label) {
  Write-Sub $label

  # IMPORTANT:
  # PowerShell can treat native stderr output as a terminating error (NativeCommandError) when $ErrorActionPreference="Stop".
  # Your global-setup logs to stderr even on success, so we execute via cmd.exe with "2>&1" inside cmd to avoid that.
  $cmdArgs = @("exec","playwright","test") + $specs + @("--workers=$Workers","--reporter=$Reporter")
  $cmdLine = "pnpm " + (($cmdArgs | ForEach-Object { Quote-CmdArg $_ }) -join " ") + " 2>&1"

  Write-Report ("Command: {0}" -f $cmdLine)

  Write-Host ""
  Write-Host ("==> {0}" -f $label) -ForegroundColor Cyan

  $tmp = New-TemporaryFile
  try {
    & $env:ComSpec /d /c $cmdLine | Tee-Object -FilePath $tmp.FullName
    $exit = $LASTEXITCODE

    Write-Report ("ExitCode: {0}" -f $exit)
    Write-Report "---- output ----"
    Get-Content -LiteralPath $tmp.FullName -ErrorAction SilentlyContinue | ForEach-Object { Write-Report $_ }
    Write-Report "---- end output ----"
    return $exit
  } finally {
    Remove-Item -LiteralPath $tmp.FullName -Force -ErrorAction SilentlyContinue
  }
}

Write-Header "4) Runtime: Playwright failing specs first ($Workers worker(s))"
$exit1 = Run-Playwright -specs $failingSpecs -label "Failing-specs run (ordered)"

if ($exit1 -ne 0 -and -not $ForceFullSuite) {
  Write-Header "STOPPING"
  Write-Report "Failing specs still failing; full suite skipped. Re-run with -ForceFullSuite to run anyway."
} else {
  if ($RunFullSuite -or $ForceFullSuite) {
    Write-Header "5) Runtime: Playwright FULL suite ($Workers worker(s))"
    $exit2 = Run-Playwright -specs @() -label "Full suite run"
    Write-Report ("Full suite ExitCode: {0}" -f $exit2)
  } else {
    Write-Header "NOTE"
    Write-Report "Full suite not requested. Re-run with -RunFullSuite to run everything after failing-specs pass."
  }
}

Write-Header "DONE"
Write-Report ("Report written: {0}" -f $fullOut)
Write-Host ""
Write-Host ("Report written: {0}" -f $fullOut) -ForegroundColor Green
