<#
  scan-e2e-determinism.ps1
  ------------------------
  Scans the repo to find likely sources of "passes alone, fails in full suite" flakiness:
  - Tests that rely on "first item" / nth(0) / broad selectors
  - API routes with potentially nondeterministic ordering (orderBy createdAt without stable tie-breaker)
  - Local sorting in JS/TS (Array.sort) and risky randomness (Math.random / Date.now as sort key)
  - Where sellerVerified / Verified / Unverified labels are derived and rendered
  - Global setup/auth-state reuse signals, seed/reset entry points

  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\scan-e2e-determinism.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\scan-e2e-determinism.ps1 -OutDir tools/_reports
#>

param(
  [string]$OutDir = "tools/_reports",
  [string]$OutFile = ("scan-e2e-determinism-{0}.txt" -f (Get-Date -Format "yyyyMMdd-HHmmss")),

  [int]$MaxFileList = 250,
  [int]$MaxContextHitsPerFile = 18,
  [int]$ContextBefore = 2,
  [int]$ContextAfter = 6,

  # How many "top suspects" to print per category
  [int]$TopN = 40
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ----------------------------- Utilities -----------------------------
function To-Arr($x) {
  if ($null -eq $x) { Write-Output -NoEnumerate @(); return }
  Write-Output -NoEnumerate @($x)
}
function TrimLine([string]$s) { if ($null -eq $s) { "" } else { $s.TrimEnd() } }

$Lines = New-Object System.Collections.Generic.List[string]
function Add-Line([string]$s) { [void]$Lines.Add($s) }
function Add-Header([string]$t) { Add-Line ""; Add-Line ("=" * 110); Add-Line $t; Add-Line ("=" * 110) }
function Add-Sub([string]$t) { Add-Line ""; Add-Line ("-" * 110); Add-Line $t; Add-Line ("-" * 110) }

function Safe-ReadRaw([string]$Path) {
  try { return Get-Content -LiteralPath $Path -Raw -ErrorAction Stop } catch { return $null }
}

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

  $hitsArr = To-Arr $hits
  if ($hitsArr.Count -eq 0) { Add-Line "  (no hits)"; return 0 }

  $i = 0
  foreach ($h in $hitsArr) {
    $i++
    if ($i -gt $MaxHits) { Add-Line ("  (truncated; {0}+ hits)" -f $hitsArr.Count); break }

    $lineNo = "?"
    if ($null -ne $h -and $h.PSObject.Properties.Match("LineNumber").Count -gt 0) { $lineNo = $h.LineNumber }

    $lineTxt = ""
    if ($null -ne $h -and $h.PSObject.Properties.Match("Line").Count -gt 0) { $lineTxt = (TrimLine $h.Line) }

    Add-Line ("  [Line {0}] {1}" -f $lineNo, $lineTxt)

    $pre = @()
    $post = @()

    if ($null -ne $h -and $h.PSObject.Properties.Match("Context").Count -gt 0 -and $null -ne $h.Context) {
      $ctx = $h.Context
      if ($ctx.PSObject.Properties.Match("PreContext").Count -gt 0 -and $null -ne $ctx.PreContext) { $pre = To-Arr $ctx.PreContext }
      if ($ctx.PSObject.Properties.Match("PostContext").Count -gt 0 -and $null -ne $ctx.PostContext) { $post = To-Arr $ctx.PostContext }
    }

    foreach ($pl in (To-Arr $pre)) { if ($pl) { Add-Line ("        (pre)  {0}" -f (TrimLine $pl)) } }
    foreach ($pl in (To-Arr $post)) { if ($pl) { Add-Line ("        (post) {0}" -f (TrimLine $pl)) } }
  }

  return $hitsArr.Count
}

function List-FilesWithPattern {
  param([string[]]$Paths, [string]$Pattern)
  $pathsArr = To-Arr $Paths
  if ($pathsArr.Count -eq 0) { return @() }

  $out = @()
  try {
    $hits = Select-String -Path $pathsArr -Pattern $Pattern -AllMatches -ErrorAction SilentlyContinue
    if ($hits) { $out = @($hits | Select-Object -ExpandProperty Path -Unique) }
  } catch { $out = @() }

  return @($out | Sort-Object -Unique)
}

function Count-MatchesInFile {
  param([string]$Path, [string]$Pattern)
  $raw = Safe-ReadRaw $Path
  if ($null -eq $raw) { return 0 }
  return ([regex]::Matches($raw, $Pattern)).Count
}

function Emit-FileList {
  param([string]$Title, [string[]]$Files)
  Add-Sub $Title
  $arr = To-Arr $Files
  if ($arr.Count -eq 0) { Add-Line "  (none)"; return }
  $i = 0
  foreach ($p in $arr) {
    $i++
    if ($i -gt $MaxFileList) { Add-Line ("  (truncated; {0}+ files)" -f $arr.Count); break }
    Add-Line ("  {0}" -f $p)
  }
}

function Emit-TopScored {
  param(
    [string]$Title,
    [hashtable]$ScoreMap,
    [int]$N = 30
  )
  Add-Sub $Title
  if ($ScoreMap.Keys.Count -eq 0) { Add-Line "  (none)"; return }

  $rows = foreach ($k in $ScoreMap.Keys) {
    [pscustomobject]@{ Path = $k; Score = [int]$ScoreMap[$k] }
  }

  $top = $rows | Sort-Object Score -Descending | Select-Object -First $N
  foreach ($r in $top) {
    Add-Line ("  [{0,3}]  {1}" -f $r.Score, $r.Path)
  }
}

# ----------------------------- Patterns -----------------------------
# A) Tests: "first item" selection + brittle selectors
$RX_TEST_FIRST            = '(?i)\.first\s*\(\s*\)'
$RX_TEST_NTH0             = '(?i)\.nth\s*\(\s*0\s*\)'
$RX_TEST_FIRST_CHILD      = '(?i):first-child|:first-of-type'
$RX_TEST_BROAD_HAS_TEXT   = '(?i)\.filter\s*\(\s*\{\s*hasText\s*:\s*["''][^"'']+["'']\s*\}\s*\)'
$RX_TEST_GETBYTEXT_VERIF  = '(?i)getByText\(\s*\/\\bVerified\\b\/i|getByText\(\s*\/\\bUnverified\\b\/i|getByText\(\s*\/\\bVerified\\b\/'
$RX_TEST_ANCHOR_FIRST     = '(?i)a\[href\^\s*=\s*["'']\/(product|service)\/["'']\]\)\.first|a\[href\^\s*=\s*["'']\/(product|service)\/["'']\]\x27\)\.first'

# B) API / data ordering suspects (Prisma-ish + general)
$RX_PRISMA_FINDMANY       = '(?i)\.findMany\s*\('
$RX_ORDERBY               = '(?i)\borderBy\s*:'
$RX_ORDERBY_CREATEDAT     = '(?is)orderBy\s*:\s*(\[[^\]]*createdAt[^\]]*\]|\{[^}]*createdAt[^}]*\})'
$RX_ORDERBY_ID            = '(?is)orderBy\s*:\s*(\[[^\]]*\bid\b[^\]]*\]|\{[^}]*\bid\b[^}]*\})'
$RX_ORDERBY_CREATED_ONLY  = '(?is)orderBy\s*:\s*(\[[^\]]*createdAt[^\]]*\]|\{[^}]*createdAt[^}]*\})'  # we will post-filter for missing id nearby

# C) JS/TS sorts + randomness
$RX_ARRAY_SORT            = '(?i)\.sort\s*\('
$RX_MATH_RANDOM           = '(?i)\bMath\.random\s*\('
$RX_DATE_NOW              = '(?i)\bDate\.now\s*\('

# D) Verified plumbing / labels
$RX_SELLER_VERIFIED       = '(?i)\bsellerVerified\b|\bemailVerified\b|\bverified\b\s*:\s*(true|false)|\bverified\b'
$RX_VERIFIED_WORDS        = '(?i)\bVerified\b|\bUnverified\b'
$RX_VERIFIED_BADGE_TESTID = '(?i)data-testid\s*=\s*["''](verified-badge|unverified-badge)["'']'

# E) E2E harness/seed/reset hooks
$RX_GLOBAL_SETUP          = '(?i)\bglobal-setup\b'
$RX_PLAYWRIGHT_CONFIG     = '(?i)\bplaywright\.config\b'
$RX_STORAGE_STATE         = '(?i)\bstorageState\b|\.auth\\|tests\/e2e\/\.auth'
$RX_PRISMA_SEED           = '(?i)\bprisma\b.*\bseed\b|prisma\/seed\.ts|db\s+seed'
$RX_E2E_ENDPOINTS         = '(?i)\/api\/e2e\/(reset|seed)|E2E_SECRET|NODE_ENV\s*===\s*["'']test["'']|process\.env\.E2E'

# ----------------------------- Collect files (exclude junk) -----------------------------
$repoRoot = (Resolve-Path ".").Path

$all = @(
  Get-ChildItem -Recurse -File -Force -ErrorAction SilentlyContinue |
    Where-Object {
      $_.FullName -notmatch '\\node_modules\\' -and
      $_.FullName -notmatch '\\\.next\\' -and
      $_.FullName -notmatch '\\dist\\' -and
      $_.FullName -notmatch '\\out\\' -and
      $_.FullName -notmatch '\\coverage\\' -and
      $_.FullName -notmatch '\\tools\\_reports\\' -and
      $_.FullName -notmatch '\\\.git\\'
    }
)

$codeFiles = @(
  $all |
    Where-Object { $_.Extension -in ".ts",".tsx",".js",".jsx",".mjs",".cjs" } |
    Select-Object -ExpandProperty FullName
)

$testFiles = @(
  $all |
    Where-Object { $_.FullName -match '(?i)\\tests\\e2e\\' -and $_.Extension -in ".ts",".tsx",".js" } |
    Select-Object -ExpandProperty FullName
)

$apiFiles = @(
  $all |
    Where-Object { $_.FullName -match '(?i)\\src\\app\\api\\' -and $_.Extension -in ".ts",".tsx" } |
    Select-Object -ExpandProperty FullName
)

$prismaFiles = @(
  $all |
    Where-Object { $_.FullName -match '(?i)\\prisma\\' -and $_.Extension -in ".ts",".js",".prisma" } |
    Select-Object -ExpandProperty FullName
)

$configFiles = @()
$configFiles += @(Get-ChildItem -File -ErrorAction SilentlyContinue -Path $repoRoot -Filter "playwright.config.*" | Select-Object -ExpandProperty FullName)
$configFiles += @(Get-ChildItem -File -ErrorAction SilentlyContinue -Path $repoRoot -Filter "package.json"          | Select-Object -ExpandProperty FullName)

New-Item -ItemType Directory -Force $OutDir | Out-Null
$fullOut = Join-Path (Join-Path $repoRoot $OutDir) $OutFile

# ----------------------------- Header -----------------------------
Add-Header "QwikSale scan: E2E determinism + flake sources (full suite vs single spec)"
Add-Line ("Generated: {0}" -f (Get-Date))
Add-Line ("Repo:      {0}" -f $repoRoot)
Add-Line ("Code:      {0} files" -f (To-Arr $codeFiles).Count)
Add-Line ("Tests:     {0} files" -f (To-Arr $testFiles).Count)
Add-Line ("API:       {0} files" -f (To-Arr $apiFiles).Count)
Add-Line ("Prisma:    {0} files" -f (To-Arr $prismaFiles).Count)
Add-Line ("Out:       {0}" -f $fullOut)

# ----------------------------- 0) Key files -----------------------------
Add-Header "0) Key harness files"
Emit-FileList -Title "Playwright config / package.json found" -Files (@($configFiles | Sort-Object -Unique))

$globalSetupFiles = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_GLOBAL_SETUP)
Emit-FileList -Title "Global setup signals" -Files $globalSetupFiles

# ----------------------------- 1) Tests: first-item + brittle selectors -----------------------------
Add-Header "1) Tests: 'first item' selection & brittle selectors"

$testFirstFiles  = @(List-FilesWithPattern -Paths $testFiles -Pattern $RX_TEST_FIRST)
$testNth0Files   = @(List-FilesWithPattern -Paths $testFiles -Pattern $RX_TEST_NTH0)
$testHasTextFiles= @(List-FilesWithPattern -Paths $testFiles -Pattern $RX_TEST_BROAD_HAS_TEXT)
$testVerifFiles  = @(List-FilesWithPattern -Paths $testFiles -Pattern $RX_TEST_GETBYTEXT_VERIF)

Emit-FileList -Title "A) Tests using .first() (high flake risk when dataset changes)" -Files $testFirstFiles
Emit-FileList -Title "B) Tests using .nth(0)" -Files $testNth0Files
Emit-FileList -Title "C) Tests using filter({hasText: ...}) (often too-broad)" -Files $testHasTextFiles
Emit-FileList -Title "D) Tests asserting Verified/Unverified text" -Files $testVerifFiles

# Score tests (to prioritize which ones are most likely to be order-dependent)
$testScores = @{}
foreach ($p in (To-Arr $testFiles)) {
  $s = 0
  $s += 3 * (Count-MatchesInFile $p $RX_TEST_FIRST)
  $s += 3 * (Count-MatchesInFile $p $RX_TEST_NTH0)
  $s += 2 * (Count-MatchesInFile $p $RX_TEST_BROAD_HAS_TEXT)
  $s += 2 * (Count-MatchesInFile $p $RX_TEST_FIRST_CHILD)
  $s += 2 * (Count-MatchesInFile $p $RX_TEST_GETBYTEXT_VERIF)
  if ($s -gt 0) { $testScores[$p] = $s }
}
Emit-TopScored -Title ("Top {0} test files by flake-risk score" -f $TopN) -ScoreMap $testScores -N $TopN

# ----------------------------- 2) API: ordering determinism suspects -----------------------------
Add-Header "2) API routes: ordering determinism suspects (createdAt without id tie-breaker)"

$apiOrderByFiles = @(List-FilesWithPattern -Paths $apiFiles -Pattern $RX_ORDERBY)
$apiCreatedFiles = @(List-FilesWithPattern -Paths $apiFiles -Pattern $RX_ORDERBY_CREATEDAT)
$apiIdOrderFiles = @(List-FilesWithPattern -Paths $apiFiles -Pattern $RX_ORDERBY_ID)

Emit-FileList -Title "A) API files with orderBy" -Files $apiOrderByFiles
Emit-FileList -Title "B) API files ordering by createdAt" -Files $apiCreatedFiles
Emit-FileList -Title "C) API files with id in orderBy (good sign)" -Files $apiIdOrderFiles

# Heuristic: "createdAt orderBy" without "id orderBy" (in same file) => suspect
$apiSuspects = @()
foreach ($p in (To-Arr $apiCreatedFiles)) {
  if ($apiIdOrderFiles -notcontains $p) { $apiSuspects += $p }
}
Emit-FileList -Title "D) SUSPECT: createdAt ordering without id tie-breaker (file-level heuristic)" -Files (@($apiSuspects | Sort-Object -Unique))

# Score API files
$apiScores = @{}
foreach ($p in (To-Arr $apiFiles)) {
  $s = 0
  $s += 2 * (Count-MatchesInFile $p $RX_PRISMA_FINDMANY)
  $s += 3 * (Count-MatchesInFile $p $RX_ORDERBY_CREATEDAT)
  $s -= 2 * (Count-MatchesInFile $p $RX_ORDERBY_ID)
  $s += 2 * (Count-MatchesInFile $p $RX_ARRAY_SORT)
  $s += 8 * (Count-MatchesInFile $p $RX_MATH_RANDOM)
  if ($s -gt 0) { $apiScores[$p] = $s }
}
Emit-TopScored -Title ("Top {0} API files by nondeterminism score" -f $TopN) -ScoreMap $apiScores -N $TopN

Add-Sub "E) Context: createdAt orderBy in suspect API files"
foreach ($p in (To-Arr $apiSuspects | Select-Object -First $TopN)) {
  Add-Line ""
  Add-Line ("FILE: {0}" -f $p)
  [void](Add-ContextHits -Path $p -Pattern $RX_ORDERBY_CREATEDAT -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After $ContextAfter)
}

# ----------------------------- 3) Local sorting / randomness in app code -----------------------------
Add-Header "3) App code: local sorting / randomness (can reorder results across runs)"

$sortFiles = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_ARRAY_SORT)
$randFiles = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_MATH_RANDOM)
$nowFiles  = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_DATE_NOW)

Emit-FileList -Title "A) Files using Array.sort(...)" -Files $sortFiles
Emit-FileList -Title "B) Files using Math.random() (highest risk if used in sort/order/seed)" -Files $randFiles
Emit-FileList -Title "C) Files using Date.now() (can impact ordering/expiry logic in tests)" -Files $nowFiles

# ----------------------------- 4) Verified plumbing / rendering -----------------------------
Add-Header "4) Verified/Unverified plumbing (where label can disappear)"

$verifFiles = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_VERIFIED_WORDS)
$sellerVerFiles = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_SELLER_VERIFIED)
$badgeTestIdFiles = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_VERIFIED_BADGE_TESTID)

Emit-FileList -Title "A) Files containing 'Verified'/'Unverified' text" -Files $verifFiles
Emit-FileList -Title "B) Files referencing sellerVerified / verified fields" -Files $sellerVerFiles
Emit-FileList -Title "C) Files with verified-badge/unverified-badge testid" -Files $badgeTestIdFiles

# Score verified-related files (prioritize likely card/detail render points)
$verifScores = @{}
foreach ($p in (To-Arr $sellerVerFiles)) {
  $s = 0
  $s += 3 * (Count-MatchesInFile $p $RX_SELLER_VERIFIED)
  $s += 2 * (Count-MatchesInFile $p $RX_VERIFIED_WORDS)
  $s += 1 * (Count-MatchesInFile $p $RX_VERIFIED_BADGE_TESTID)
  if ($s -gt 0) { $verifScores[$p] = $s }
}
Emit-TopScored -Title ("Top {0} files by Verified-plumbing score" -f $TopN) -ScoreMap $verifScores -N $TopN

Add-Sub "D) Context: sellerVerified / Verified label sites (top)"
foreach ($p in (To-Arr ($sellerVerFiles | Select-Object -First $TopN))) {
  Add-Line ""
  Add-Line ("FILE: {0}" -f $p)
  [void](Add-ContextHits -Path $p -Pattern $RX_SELLER_VERIFIED -MaxHits 10 -Before $ContextBefore -After $ContextAfter)
}

# ----------------------------- 5) Harness: storageState reuse, seed/reset entry points -----------------------------
Add-Header "5) Harness: storageState reuse + seed/reset entry points"

$storageFiles = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_STORAGE_STATE)
$seedFiles    = @(List-FilesWithPattern -Paths ($codeFiles + $prismaFiles) -Pattern $RX_PRISMA_SEED)
$e2eFiles     = @(List-FilesWithPattern -Paths ($codeFiles + $apiFiles) -Pattern $RX_E2E_ENDPOINTS)

Emit-FileList -Title "A) Files referencing storageState / .auth (auth freshness risk)" -Files $storageFiles
Emit-FileList -Title "B) Seed signals (prisma seed / db seed)" -Files $seedFiles
Emit-FileList -Title "C) E2E reset/seed endpoint signals" -Files $e2eFiles

# ----------------------------- 6) Shortlist: likely fixes -----------------------------
Add-Header "6) Shortlist: where to look first"

# Shortlist heuristic:
# - Any API suspect (createdAt orderBy without id) is a prime target
# - Any test with high flake score is a prime target
# - Any file that touches sellerVerified and is in components/pages is a prime target

Add-Line "Shortlist rule of thumb:"
Add-Line "  1) Fix API ordering first (createdAt + id tie-breaker) => makes 'first item' less random."
Add-Line "  2) Fix tests that rely on first()/nth(0) => select by seeded ID or by matching title from API."
Add-Line "  3) Confirm Verified label renders as text when sellerVerified is boolean (card + detail)."

Emit-TopScored -Title ("A) Top {0} API suspects (order determinism)" -f $TopN) -ScoreMap $apiScores -N $TopN
Emit-TopScored -Title ("B) Top {0} flaky tests (selection patterns)" -f $TopN) -ScoreMap $testScores -N $TopN
Emit-TopScored -Title ("C) Top {0} Verified plumbing hotspots" -f $TopN) -ScoreMap $verifScores -N $TopN

Add-Header "DONE"
Add-Line ("Report written: {0}" -f $fullOut)

Set-Content -LiteralPath $fullOut -Value $Lines -Encoding UTF8 -Force
Write-Host ("Report written: {0}" -f $fullOut)
