param(
  [string]$OutFile = "badge-misalignment-report.txt"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ----------------------------- Regex constants -----------------------------
# In PS single-quoted strings: '' represents a literal single quote character.
$RX_TIER_TESTID     = 'data-testid\s*=\s*["'']featured-tier-(basic|gold|diamond)["'']'
$RX_VERIFIED_TESTID = 'data-testid\s*=\s*["''](verified-badge|unverified-badge)["'']'
$RX_FEATURED_TEXT   = '(?i)\bFeatured\s+(basic|gold|diamond)\b'
$RX_FEATURED_KEYS   = '(?i)\bfeatured_tier\b|\bfeaturedTier\b|\bsubscriptionTier\b|\bplan\b|\btier\b'
$RX_VERIFIED_KEYS   = '(?i)\bverifiedSeller\b|\bisVerified\b|\baccountVerified\b|\bseller_verified\b|\bverified\b|\bunverified\b'

function Write-Report {
  param([string]$Line)
  Add-Content -LiteralPath $OutFile -Value $Line -Encoding UTF8
}

function Header {
  param([string]$Title)
  Write-Report ""
  Write-Report ("=" * 110)
  Write-Report $Title
  Write-Report ("=" * 110)
}

function SubHeader {
  param([string]$Title)
  Write-Report ""
  Write-Report ("-" * 110)
  Write-Report $Title
  Write-Report ("-" * 110)
}

function ContextBlock {
  param(
    [string]$Path,
    [string]$Pattern,
    [int]$Before = 2,
    [int]$After = 2
  )

  # IMPORTANT: force array always (fixes StrictMode Count errors)
  $matches = @()
  try {
    $matches = @(Select-String -LiteralPath $Path -Pattern $Pattern -AllMatches -Context $Before,$After -ErrorAction SilentlyContinue)
  } catch {
    $matches = @()
  }

  foreach ($m in $matches) {
    $lineNo = $m.LineNumber
    Write-Report ("  [Line {0}] {1}" -f $lineNo, $m.Line.TrimEnd())

    foreach ($pl in ($m.Context.PreContext  | ForEach-Object { $_ })) {
      if ($pl -ne $null -and $pl.Length -gt 0) { Write-Report ("        (pre)  {0}" -f $pl.TrimEnd()) }
    }
    foreach ($pl in ($m.Context.PostContext | ForEach-Object { $_ })) {
      if ($pl -ne $null -and $pl.Length -gt 0) { Write-Report ("        (post) {0}" -f $pl.TrimEnd()) }
    }
  }

  return $matches.Count
}

function CountToken {
  param([string]$Text, [string]$TokenRegex)
  try {
    if ([string]::IsNullOrWhiteSpace($TokenRegex)) { return 0 }
    return ([regex]::Matches($Text, $TokenRegex)).Count
  } catch {
    return 0
  }
}

function Scan-TargetFile {
  param([string]$Path)

  Write-Report ""
  Write-Report ("FILE: {0}" -f $Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Report "  !! MISSING FILE (path not found)"
    return
  }

  $raw = Get-Content -LiteralPath $Path -Raw -ErrorAction Stop

  $isTest = $Path -like "tests/*" -or $Path -like "tests\*"
  $isApi  = $Path -like "src/app/api/*" -or $Path -like "src\app\api\*"

  $tierTestIdCount = CountToken $raw $RX_TIER_TESTID
  $verifiedIdCount = CountToken $raw $RX_VERIFIED_TESTID
  $hasSellerBadges = $raw -match '\bsellerBadges\b'
  $hasAliases = ($raw -match '\bsellerVerified\b') -or ($raw -match '\bsellerFeaturedTier\b')
  $hasSellerInfo = $raw -match '<SellerInfo\b'

  Write-Report ("  Tokens: featured-tier testids={0}, verified/unverified testids={1}, has sellerBadges={2}, has alias fields={3}, has SellerInfo={4}" -f `
    $tierTestIdCount, $verifiedIdCount, $hasSellerBadges, $hasAliases, $hasSellerInfo
  )

  if ($isTest) {
    SubHeader "  Suspicious test assertions (tier text / Verified text usage)"
    [void](ContextBlock -Path $Path -Pattern 'getByText\([^)]*Featured' -Before 2 -After 2)
    [void](ContextBlock -Path $Path -Pattern 'getByText\([^)]*(Verified|Unverified)' -Before 2 -After 2)
    [void](ContextBlock -Path $Path -Pattern 'featured-tier-(basic|gold|diamond)' -Before 2 -After 2)
    return
  }

  if ($isApi) {
    SubHeader "  API payload normalization checks (sellerBadges / aliases / legacy keys)"
    [void](ContextBlock -Path $Path -Pattern '\bsellerBadges\b' -Before 2 -After 2)
    [void](ContextBlock -Path $Path -Pattern '\bsellerVerified\b|\bsellerFeaturedTier\b' -Before 2 -After 2)
    [void](ContextBlock -Path $Path -Pattern $RX_FEATURED_KEYS -Before 2 -After 2)
    [void](ContextBlock -Path $Path -Pattern '(?i)\bverifiedSeller\b|\bisVerified\b|\baccountVerified\b|\bseller_verified\b' -Before 2 -After 2)
    return
  }

  SubHeader "  Tier rule violations / risks (text tiers, missing testids, boolean-derived tier)"
  [void](ContextBlock -Path $Path -Pattern $RX_FEATURED_TEXT -Before 2 -After 2)
  [void](ContextBlock -Path $Path -Pattern $RX_TIER_TESTID -Before 2 -After 2)
  [void](ContextBlock -Path $Path -Pattern '(aria-label|title)\s*=\s*["'']Featured\s+(basic|gold|diamond)["'']' -Before 2 -After 2)
  [void](ContextBlock -Path $Path -Pattern '(?i)\bfeatured\b\s*&&|\bif\s*\(\s*.*\.featured\s*\)|\bfeatured\s*\?\s*' -Before 2 -After 2)
  [void](ContextBlock -Path $Path -Pattern $RX_FEATURED_KEYS -Before 2 -After 2)

  SubHeader "  Verification duplication risks near SellerInfo (multiple badge blocks / legacy verified usage)"
  [void](ContextBlock -Path $Path -Pattern '<SellerInfo\b' -Before 2 -After 2)
  [void](ContextBlock -Path $Path -Pattern $RX_VERIFIED_TESTID -Before 2 -After 2)
  [void](ContextBlock -Path $Path -Pattern $RX_VERIFIED_KEYS -Before 1 -After 1)

  if ($hasSellerInfo -and ($raw -match 'SellerBadgesRow|SellerBadgesInline|VerifiedPill|VerifiedBadge')) {
    Write-Report ""
    Write-Report "  !! POSSIBLE DUPLICATION: SellerInfo + another badge renderer detected in same file (search SellerBadgesRow/Inline/VerifiedPill/VerifiedBadge)."
  }
}

# ----------------------------- Run scan -----------------------------

Remove-Item -LiteralPath $OutFile -ErrorAction SilentlyContinue
New-Item -ItemType File -Force -Path $OutFile | Out-Null

Header "QwikSale Badge Misalignment Scan"
Write-Report ("Generated: {0}" -f (Get-Date))
Write-Report ("Repo: {0}" -f (Get-Location))

Header "1) Targeted file scan"

$targets = @(
  "src/app/api/products/route.ts",
  "src/app/api/services/route.ts",
  "src/app/api/search/route.ts",
  "src/app/api/home-feed/route.ts",
  "src/app/api/products/[id]/route.ts",
  "src/app/api/services/[id]/route.ts",
  "src/app/lib/sellerVerification.ts",
  "src/app/components/VerifiedBadge.tsx",
  "src/app/components/SellerInfo.tsx",
  "src/app/_components/HomeClientNoSSR.tsx",
  "src/app/_components/HomeClient.tsx",
  "src/app/components/ProductCard.tsx",
  "src/app/components/ServiceCard.tsx",
  "src/app/components/ListingCard.tsx",
  "src/app/product/[id]/ProductPageClient.tsx",
  "src/app/service/[id]/ServicePageClient.tsx",
  "src/app/store/[username]/page.tsx",
  "tests/e2e/home-tabs.spec.ts",
  "tests/e2e/product-flow.spec.ts",
  "tests/e2e/store-flow.spec.ts",
  "tests/e2e/header-search.spec.ts",
  "tests/e2e/service-flow.spec.ts"
)

foreach ($t in $targets) {
  Scan-TargetFile -Path $t
}

Header "2) Repo-wide discovery (where badges / tier words / old assertions still live)"

$codeFiles = Get-ChildItem -Path "src","tests" -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension -in ".ts",".tsx" } |
  Select-Object -ExpandProperty FullName

SubHeader "  A) Any remaining tier TEXT like 'Featured gold/basic/diamond' (should not be visible tier words)"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_FEATURED_TEXT -AllMatches -ErrorAction SilentlyContinue
  foreach ($h in $hits) { Write-Report ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) }
  if (-not $hits) { Write-Report "  (none found)" }
} catch { Write-Report "  (scan failed)" }

SubHeader "  B) Where featured-tier testids exist (inventory)"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_TIER_TESTID -AllMatches -ErrorAction SilentlyContinue
  foreach ($h in $hits) { Write-Report ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) }
  if (-not $hits) { Write-Report "  (none found)  <-- UI isn't rendering required selectors anywhere." }
} catch { Write-Report "  (scan failed)" }

SubHeader "  C) Where Verified/Unverified testids exist (inventory)"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_VERIFIED_TESTID -AllMatches -ErrorAction SilentlyContinue
  foreach ($h in $hits) { Write-Report ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) }
  if (-not $hits) { Write-Report "  (none found)" }
} catch { Write-Report "  (scan failed)" }

SubHeader "  D) Any Playwright tier assertions still using getByText('Featured ...')"
try {
  $hits = Select-String -Path $codeFiles -Pattern 'getByText\([^)]*Featured' -AllMatches -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like "*tests*e2e*" }
  foreach ($h in $hits) { Write-Report ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) }
  if (-not $hits) { Write-Report "  (none found)" }
} catch { Write-Report "  (scan failed)" }

SubHeader "  E) Any Playwright Verified/Unverified assertions still using getByText"
try {
  $hits = Select-String -Path $codeFiles -Pattern 'getByText\([^)]*(Verified|Unverified)' -AllMatches -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like "*tests*e2e*" }
  foreach ($h in $hits) { Write-Report ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) }
  if (-not $hits) { Write-Report "  (none found)" }
} catch { Write-Report "  (scan failed)" }

Header "DONE"
Write-Report ("Report written to: {0}" -f (Resolve-Path -LiteralPath $OutFile).Path)
