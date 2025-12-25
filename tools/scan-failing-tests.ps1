param(
  # Writes into tools/_reports by default
  [string]$OutDir = "tools/_reports",
  [string]$OutFile = ("scan-failing-tests-{0}.txt" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ----------------------------- Patterns -----------------------------
$RX_FEATURED_TESTID     = 'data-testid\s*=\s*["'']featured-tier-(basic|gold|diamond)["'']'
$RX_VERIFIED_TESTID     = 'data-testid\s*=\s*["''](verified-badge|unverified-badge)["'']'
$RX_FEATURED_TEXT_ANY   = '(?i)\bFeatured\s+(basic|gold|diamond)\b'
$RX_FEATURED_VISIBLE    = '(?i)>\s*Featured\s+(basic|gold|diamond)\s*<'

$RX_TEST_GETBYTESTID_TIER = 'getByTestId\(\s*[`"'' ]*featured-tier-(basic|gold|diamond)'
$RX_TEST_GETBYTEXT_VER    = 'getByText\([^)]*(Verified|Unverified)'

# Home link / navigation suspects
$RX_HOME_HREF =
  '(?is)(<Link[^>]+href\s*=\s*(\{)?\s*["'']\/["'']\s*(\})?)|(<a[^>]+href\s*=\s*["'']\/["''])|(href\s*:\s*["'']\/["''])'
$RX_HOME_TESTID = 'data-testid\s*=\s*["'']home-link["'']'
$RX_PREVENT_DEFAULT = '(?i)\bpreventDefault\s*\('
$RX_ROUTER_TO_HOME  = '(?i)\brouter\.(push|replace)\(\s*["'']\/["'']'

# Badge field usage (helps detect places that *should* render a tier badge but don't)
$RX_TIER_FIELDS = '(?i)\bsellerFeaturedTier\b|\bsellerBadges\b|\bfeaturedTier\b|\bfeatured_tier\b'

# ----------------------------- Output buffer (no file-lock spam) -----------------------------
$Lines = New-Object System.Collections.Generic.List[string]
function Add-Line([string]$s) { [void]$Lines.Add($s) }
function Add-Header([string]$t) { Add-Line ""; Add-Line ("=" * 110); Add-Line $t; Add-Line ("=" * 110) }
function Add-Sub([string]$t) { Add-Line ""; Add-Line ("-" * 110); Add-Line $t; Add-Line ("-" * 110) }

function Add-ContextHits {
  param(
    [string]$Path,
    [string]$Pattern,
    [int]$MaxHits = 12,
    [int]$Before = 2,
    [int]$After = 2
  )

  $hits = @()
  try {
    $hits = @(Select-String -LiteralPath $Path -Pattern $Pattern -AllMatches -Context $Before,$After -ErrorAction SilentlyContinue)
  } catch { $hits = @() }

  if (-not $hits -or $hits.Count -eq 0) { Add-Line "  (no hits)"; return 0 }

  $i = 0
  foreach ($h in $hits) {
    $i++
    if ($i -gt $MaxHits) { Add-Line ("  (truncated; {0}+ hits)" -f $hits.Count); break }
    Add-Line ("  [Line {0}] {1}" -f $h.LineNumber, $h.Line.TrimEnd())
    foreach ($pl in ($h.Context.PreContext | ForEach-Object { $_ })) { if ($pl) { Add-Line ("        (pre)  {0}" -f $pl.TrimEnd()) } }
    foreach ($pl in ($h.Context.PostContext | ForEach-Object { $_ })) { if ($pl) { Add-Line ("        (post) {0}" -f $pl.TrimEnd()) } }
  }
  return $hits.Count
}

function Safe-ReadRaw([string]$Path) {
  try { return Get-Content -LiteralPath $Path -Raw -ErrorAction Stop } catch { return $null }
}

function Scan-OneFileSummary {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    Add-Line ""
    Add-Line ("FILE: {0}" -f $Path)
    Add-Line "  !! MISSING FILE (path not found)"
    return
  }

  $raw = Safe-ReadRaw $Path
  if ($null -eq $raw) {
    Add-Line ""
    Add-Line ("FILE: {0}" -f $Path)
    Add-Line "  !! READ FAILED"
    return
  }

  $tierTestIdCount = ([regex]::Matches($raw, $RX_FEATURED_TESTID)).Count
  $verTestIdCount  = ([regex]::Matches($raw, $RX_VERIFIED_TESTID)).Count
  $hasTierFields   = ($raw -match $RX_TIER_FIELDS)
  $hasHomeHref     = ($raw -match $RX_HOME_HREF) -or ($raw -match $RX_HOME_TESTID)
  $hasPrevent      = ($raw -match $RX_PREVENT_DEFAULT)
  $hasRouterHome   = ($raw -match $RX_ROUTER_TO_HOME)

  Add-Line ""
  Add-Line ("FILE: {0}" -f $Path)
  Add-Line ("  Signals: tierTestIds={0}, verifiedTestIds={1}, hasTierFields={2}, homeLinkSignals={3}, preventDefault={4}, routerToHome={5}" -f `
    $tierTestIdCount, $verTestIdCount, $hasTierFields, $hasHomeHref, $hasPrevent, $hasRouterHome
  )
}

# ----------------------------- Collect files -----------------------------
$repoRoot = (Get-Location).Path
$codeFiles = @(Get-ChildItem -Path "src","tests" -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension -in ".ts",".tsx",".js",".jsx" } |
  Select-Object -ExpandProperty FullName)

New-Item -ItemType Directory -Force $OutDir | Out-Null
$fullOut = Join-Path (Join-Path $repoRoot $OutDir) $OutFile

Add-Header "QwikSale scan: failing tests + repo-wide offender discovery"
Add-Line ("Generated: {0}" -f (Get-Date))
Add-Line ("Repo:      {0}" -f $repoRoot)
Add-Line ("Files:     {0}" -f $codeFiles.Count)
Add-Line ("Out:       {0}" -f $fullOut)

# ----------------------------- 1) Failing tests first -----------------------------
Add-Header "1) Failing specs (local context)"

$failingTests = @(
  "tests/e2e/home-host.spec.ts",
  "tests/e2e/home-tabs.spec.ts",
  "tests/e2e/product-flow.spec.ts",
  "tests/e2e/store-flow.spec.ts"
)

foreach ($t in $failingTests) {
  Scan-OneFileSummary -Path $t

  if (Test-Path -LiteralPath $t) {
    Add-Sub "  Patterns inside failing spec"
    Add-Line "  A) tier testid assertions"
    [void](Add-ContextHits -Path $t -Pattern $RX_TEST_GETBYTESTID_TIER -MaxHits 25 -Before 2 -After 3)

    Add-Line "  B) Verified/Unverified text assertions"
    [void](Add-ContextHits -Path $t -Pattern $RX_TEST_GETBYTEXT_VER -MaxHits 25 -Before 2 -After 3)

    Add-Line "  C) Home navigation selectors"
    [void](Add-ContextHits -Path $t -Pattern '(?i)(home-link|getByRole\([^)]*link[^)]*home|href\s*=\s*["'']\/["''])' -MaxHits 25 -Before 2 -After 3)
  }
}

# ----------------------------- 2) Home link ownership -----------------------------
Add-Header "2) Home link ownership (why click Home stays on /help)"

Add-Sub "  A) Files that define a home link (href='/' or data-testid='home-link')"
$homeFiles = @()
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_HOME_HREF -AllMatches -ErrorAction SilentlyContinue
  $homeFiles += @($hits | Select-Object -ExpandProperty Path -Unique)
} catch {}
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_HOME_TESTID -AllMatches -ErrorAction SilentlyContinue
  $homeFiles += @($hits | Select-Object -ExpandProperty Path -Unique)
} catch {}

$homeFiles = @($homeFiles | Sort-Object -Unique)
if ($homeFiles.Count -eq 0) {
  Add-Line "  (none found)  <-- that would be very weird; your Home link is being created dynamically."
} else {
  foreach ($p in $homeFiles) { Add-Line ("  {0}" -f $p) }
}

Add-Sub "  B) Context in home-link files (href '/', preventDefault, router push/replace)"
foreach ($p in $homeFiles) {
  Add-Line ""
  Add-Line ("FILE: {0}" -f $p)
  [void](Add-ContextHits -Path $p -Pattern $RX_HOME_TESTID -MaxHits 8 -Before 2 -After 2)
  [void](Add-ContextHits -Path $p -Pattern $RX_HOME_HREF -MaxHits 10 -Before 2 -After 3)
  [void](Add-ContextHits -Path $p -Pattern $RX_PREVENT_DEFAULT -MaxHits 10 -Before 2 -After 3)
  [void](Add-ContextHits -Path $p -Pattern $RX_ROUTER_TO_HOME -MaxHits 10 -Before 2 -After 3)
}

# ----------------------------- 3) Featured tier badge mismatch -----------------------------
Add-Header "3) featured-tier-* missing in UI (why tests can't find featured-tier-basic)"

Add-Sub "  A) Where featured-tier testids are DEFINED"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_FEATURED_TESTID -AllMatches -ErrorAction SilentlyContinue
  if (-not $hits) { Add-Line "  (none found)  <-- if true, UI is not rendering required selectors anywhere." }
  else {
    foreach ($h in $hits) { Add-Line ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) }
  }
} catch { Add-Line "  (scan failed)" }

Add-Sub "  B) Files that USE tier fields but DO NOT contain featured-tier testids (prime suspects)"
$tierUseFiles = @()
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_TIER_FIELDS -AllMatches -ErrorAction SilentlyContinue
  $tierUseFiles = @($hits | Select-Object -ExpandProperty Path -Unique)
} catch { $tierUseFiles = @() }

$prime = New-Object System.Collections.Generic.List[string]
foreach ($p in $tierUseFiles) {
  $raw = Safe-ReadRaw $p
  if ($null -eq $raw) { continue }
  $hasTestId = $raw -match $RX_FEATURED_TESTID
  if (-not $hasTestId) { [void]$prime.Add($p) }
}

$prime = @($prime | Sort-Object -Unique)
if ($prime.Count -eq 0) {
  Add-Line "  (none)  <-- good: every file touching tier fields also has testid rendering somewhere."
} else {
  foreach ($p in $prime) { Add-Line ("  {0}" -f $p) }
}

Add-Sub "  C) Context for prime suspects (tier fields usage)"
foreach ($p in $prime) {
  Add-Line ""
  Add-Line ("FILE: {0}" -f $p)
  [void](Add-ContextHits -Path $p -Pattern $RX_TIER_FIELDS -MaxHits 10 -Before 2 -After 3)
}

Add-Sub "  D) Visible tier text (should be icon-only; sr-only is fine)"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_FEATURED_VISIBLE -AllMatches -ErrorAction SilentlyContinue
  if (-not $hits) { Add-Line "  (none found)" }
  else {
    foreach ($h in $hits) { Add-Line ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) }
  }
} catch { Add-Line "  (scan failed)" }

# ----------------------------- 4) Verified assertions mismatch -----------------------------
Add-Header "4) Verified/Unverified mismatch (store-flow failure uses getByText)"

Add-Sub "  A) Tests still asserting Verified/Unverified text via getByText"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_TEST_GETBYTEXT_VER -AllMatches -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like "*tests*e2e*" }

  if (-not $hits) { Add-Line "  (none found)" }
  else {
    foreach ($h in $hits) { Add-Line ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) }
  }
} catch { Add-Line "  (scan failed)" }

Add-Sub "  B) Where verified/unverified testids are rendered"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_VERIFIED_TESTID -AllMatches -ErrorAction SilentlyContinue
  if (-not $hits) { Add-Line "  (none found)  <-- if true, your UI no longer renders these selectors." }
  else {
    foreach ($h in $hits) { Add-Line ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) }
  }
} catch { Add-Line "  (scan failed)" }

Add-Header "DONE"
Add-Line ("Report written: {0}" -f $fullOut)

Set-Content -LiteralPath $fullOut -Value $Lines -Encoding UTF8 -Force
Write-Host ("Report written: {0}" -f $fullOut)
