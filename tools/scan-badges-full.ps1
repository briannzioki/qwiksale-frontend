param(
  [string]$OutFile = ("badge-misalignment-report-{0}.txt" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ----------------------------- Patterns -----------------------------
$RX_TIER_TESTID     = 'data-testid\s*=\s*["'']featured-tier-(basic|gold|diamond)["'']'
$RX_VERIFIED_TESTID = 'data-testid\s*=\s*["''](verified-badge|unverified-badge)["'']'

$RX_TIER_VISIBLE_TEXT = '(?i)>\s*Featured\s+(basic|gold|diamond)\s*<'
$RX_TIER_TEXT_ANY     = '(?i)\bFeatured\s+(basic|gold|diamond)\b'

$RX_BADGES  = '\bsellerBadges\b'
$RX_ALIASES = '\bsellerVerified\b|\bsellerFeaturedTier\b'

$RX_TEST_FEATURED = 'getByText\([^)]*Featured'
$RX_TEST_VERIFIED = 'getByText\([^)]*(Verified|Unverified)'

$RX_LOCAL_BADGE_LOGIC = '(?i)\btype\s+SellerTier\b|\bpickTierFromUser\b|\bnormalizeTier\b|\bresolveVerifiedFromUser\b'

# ----------------------------- Report buffer -----------------------------
$Lines = [System.Collections.Generic.List[string]]::new()
function AddLine([string]$s) { [void]$Lines.Add($s) }
function AddHeader([string]$t) { AddLine ""; AddLine ("=" * 110); AddLine $t; AddLine ("=" * 110) }
function AddSubHeader([string]$t) { AddLine ""; AddLine ("-" * 110); AddLine $t; AddLine ("-" * 110) }

function AddHits {
  param(
    [string]$Path,
    [string]$Pattern,
    [int]$MaxHits = 10,
    [int]$Before = 1,
    [int]$After = 1
  )

  $hits = @()
  try {
    $hits = @(Select-String -LiteralPath $Path -Pattern $Pattern -AllMatches -Context $Before,$After -ErrorAction SilentlyContinue)
  } catch { $hits = @() }

  if (-not $hits -or $hits.Count -eq 0) { return 0 }

  $i = 0
  foreach ($h in $hits) {
    $i++
    if ($i -gt $MaxHits) { AddLine ("  (truncated; {0}+ hits)" -f $hits.Count); break }

    AddLine ("  [Line {0}] {1}" -f $h.LineNumber, $h.Line.TrimEnd())

    foreach ($pl in $h.Context.PreContext)  { if ($pl) { AddLine ("        (pre)  {0}" -f $pl.TrimEnd()) } }
    foreach ($pl in $h.Context.PostContext) { if ($pl) { AddLine ("        (post) {0}" -f $pl.TrimEnd()) } }
  }

  return $hits.Count
}

function Classify {
  param([string]$FullPath)

  $p = $FullPath.Replace("/", "\")
  $isTest = $p -match '(?i)\\tests\\|\\e2e\\'
  $isApi  = ($p -match '(?i)\\src\\app\\api\\') -and ((Split-Path $p -Leaf) -match '(?i)^route\.tsx?$|^route\.ts$')
  $isUi   = (-not $isApi) -and (-not $isTest) -and ($p -match '(?i)\\src\\')

  # ONLY enforce canonical badge fields on PUBLIC badge payload APIs (not admin/auth/billing)
  $isPublicBadgeApi = $p -match '(?i)\\src\\app\\api\\(?:products|services|search|home-feed)(?:\\|$)'
  $isDynamic = $p -match '\[[^\]]+\]'

  return @{
    IsTest = $isTest
    IsApi = $isApi
    IsUi = $isUi
    IsPublicBadgeApi = $isPublicBadgeApi
    IsDynamic = $isDynamic
  }
}

function ScanOne {
  param([string]$FullPath)

  $raw = ""
  try { $raw = Get-Content -LiteralPath $FullPath -Raw -ErrorAction Stop } catch { return $null }

  $m = Classify $FullPath

  $tierTestIdCount = ([regex]::Matches($raw, $RX_TIER_TESTID)).Count
  $verTestIdCount  = ([regex]::Matches($raw, $RX_VERIFIED_TESTID)).Count
  $hasBadges       = $raw -match $RX_BADGES
  $hasAliases      = $raw -match $RX_ALIASES
  $hasSellerInfo   = $raw -match '<SellerInfo\b'

  $reasons = [System.Collections.Generic.List[string]]::new()
  $brokenDetailApi = $false

  if ($m.IsApi -and $m.IsPublicBadgeApi) {
    if (-not $hasBadges -or -not $hasAliases) {
      $reasons.Add("Public badge API missing canonical badge fields (sellerBadges + sellerVerified + sellerFeaturedTier)")
      if ($m.IsDynamic) { $brokenDetailApi = $true }
    }
    if ($raw -match $RX_LOCAL_BADGE_LOGIC) {
      $reasons.Add("Drift risk: local badge normalizers inside public badge API (prefer sellerVerification.ts helpers)")
    }
  }

  if ($m.IsTest) {
    if ($raw -match $RX_TEST_FEATURED) { $reasons.Add("Test asserts Featured text (should use data-testid)") }
    if ($raw -match $RX_TEST_VERIFIED) { $reasons.Add("Test asserts Verified/Unverified text (should use data-testid)") }
  }

  if ($m.IsUi) {
    if ($raw -match $RX_TIER_VISIBLE_TEXT) {
      $reasons.Add("UI likely renders visible tier text (Featured basic/gold/diamond)  should be icon-only")
    } elseif ($raw -match $RX_TIER_TEXT_ANY) {
      $reasons.Add("UI contains tier text string (verify it isn't visible text)")
    }

    if ($hasSellerInfo -and ($raw -match $RX_VERIFIED_TESTID -or $raw -match '(?i)\bVerifiedBadge\b|\bVerifiedPill\b|SellerBadgesRow|SellerBadgesInline')) {
      $reasons.Add("Potential verification duplication: SellerInfo + another badge renderer in same file")
    }
  }

  if ($reasons.Count -eq 0) { return $null }

  AddLine ""
  AddLine ("FILE: {0}" -f $FullPath)
  AddLine ("  Kind={0} Dynamic={1} PublicBadgeApi={2}" -f ($(if($m.IsApi){"API"}elseif($m.IsTest){"TEST"}elseif($m.IsUi){"UI"}else{"OTHER"})), $m.IsDynamic, $m.IsPublicBadgeApi)
  AddLine ("  Tokens: tierTestIds={0}, verifiedTestIds={1}, hasBadges={2}, hasAliases={3}, hasSellerInfo={4}" -f $tierTestIdCount, $verTestIdCount, $hasBadges, $hasAliases, $hasSellerInfo)
  foreach ($r in $reasons) { AddLine ("  !! {0}" -f $r) }

  if ($m.IsApi -and $m.IsPublicBadgeApi) {
    AddSubHeader "  API context"
    [void](AddHits -Path $FullPath -Pattern $RX_BADGES -MaxHits 8 -Before 2 -After 2)
    [void](AddHits -Path $FullPath -Pattern $RX_ALIASES -MaxHits 8 -Before 2 -After 2)
    [void](AddHits -Path $FullPath -Pattern $RX_LOCAL_BADGE_LOGIC -MaxHits 8 -Before 2 -After 2)
  }
  elseif ($m.IsTest) {
    AddSubHeader "  Test context"
    [void](AddHits -Path $FullPath -Pattern $RX_TEST_FEATURED -MaxHits 8 -Before 2 -After 2)
    [void](AddHits -Path $FullPath -Pattern $RX_TEST_VERIFIED -MaxHits 8 -Before 2 -After 2)
  }
  elseif ($m.IsUi) {
    AddSubHeader "  UI context"
    [void](AddHits -Path $FullPath -Pattern $RX_TIER_VISIBLE_TEXT -MaxHits 8 -Before 2 -After 2)
    [void](AddHits -Path $FullPath -Pattern '<SellerInfo\b' -MaxHits 4 -Before 1 -After 2)
    [void](AddHits -Path $FullPath -Pattern $RX_VERIFIED_TESTID -MaxHits 6 -Before 2 -After 2)
  }

  return [pscustomobject]@{
    Path = $FullPath
    BrokenDetailApi = [bool]$brokenDetailApi
    Reasons = ($reasons -join "; ")
  }
}

# ----------------------------- Run -----------------------------
AddHeader "QwikSale Badge Misalignment Scan (FULL REPO)"
AddLine ("Generated: {0}" -f (Get-Date))
AddLine ("Repo: {0}" -f (Get-Location))
AddLine ("OutFile: {0}" -f $OutFile)

$roots = @("src","tests","e2e") | Where-Object { Test-Path $_ }
$codeFiles = @(Get-ChildItem -Path $roots -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension -in ".ts",".tsx",".js",".jsx" } |
  Select-Object -ExpandProperty FullName)

AddHeader ("Scanned files: {0}" -f $codeFiles.Count)

$results = @()
foreach ($f in $codeFiles) {
  try {
    $r = ScanOne -FullPath $f
    if ($r) { $results += $r }
  } catch {
    AddLine ""
    AddLine ("FILE: {0}" -f $f)
    AddLine ("  !! Scan error: {0}" -f $_.Exception.Message)
  }
}

AddHeader "SUMMARY: Broken public DETAIL badge APIs"
$broken = @($results | Where-Object { $_.BrokenDetailApi -eq $true })
if ($broken.Count -eq 0) { AddLine "  (none found)" } else { foreach ($b in $broken) { AddLine ("  {0}" -f $b.Path) } }

AddHeader "SUMMARY: All flagged files"
if ($results.Count -eq 0) { AddLine "  (none found)" } else { foreach ($x in $results) { AddLine ("  {0}  -- {1}" -f $x.Path, $x.Reasons) } }

AddHeader "DONE"

$fullOut = Join-Path (Get-Location) $OutFile
Set-Content -LiteralPath $fullOut -Value $Lines -Encoding UTF8 -Force
Write-Host ("Report written: {0}" -f $fullOut)
