<#
  scan-ui-pages.ps1
  -----------------
  Scans the repo to map:
  - Next.js App Router routes/pages: app/**/page.* and src/app/**/page.*
  - Which pages/layouts are client components ("use client")
  - PageClient patterns (ServicePageClient.tsx etc) and which pages reference them
  - Cosmetic consistency signals:
      * "new" tokens: CSS vars (bg-[var(--...)]), container-page, shadow-soft, bg-subtle, ring-focus, etc
      * "legacy" tokens: bg-white, text-gray-*, dark:bg-slate-*, border-gray-*, arbitrary hex, etc
  - Tab behavior signals:
      * ?t=, useSearchParams, useRouter, router.push/replace
      * role="tablist", aria-selected, data-state="active", Tabs imports

  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\scan-ui-pages.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\scan-ui-pages.ps1 -OutDir tools/_reports

  Output:
    - TXT report (human readable)
    - CSV summary (sortable)

#>

param(
  [string]$OutDir = "tools/_reports",
  [string]$OutFile = ("scan-ui-pages-{0}.txt" -f (Get-Date -Format "yyyyMMdd-HHmmss")),
  [string]$OutCsv  = ("scan-ui-pages-{0}.csv" -f (Get-Date -Format "yyyyMMdd-HHmmss")),

  # Output tuning
  [int]$MaxFileList = 400,
  [int]$MaxContextHitsPerFile = 14,
  [int]$ContextBefore = 2,
  [int]$ContextAfter = 6
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ----------------------------- Utilities -----------------------------
function YesNo([bool]$b) { if ($b) { "YES" } else { "NO" } }
function To-Arr($x) {
  if ($null -eq $x) { Write-Output -NoEnumerate @(); return }
  Write-Output -NoEnumerate @($x)
}
function TrimLine([string]$s) { if ($null -eq $s) { "" } else { $s.TrimEnd() } }

function Safe-ReadRaw([string]$Path) {
  try { return Get-Content -LiteralPath $Path -Raw -ErrorAction Stop } catch { return $null }
}

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

  $hitsArr = To-Arr $hits
  if ($hitsArr.Count -eq 0) { Add-Line "  (no hits)"; return 0 }

  $i = 0
  foreach ($h in $hitsArr) {
    $i++
    if ($i -gt $MaxHits) { Add-Line ("  (truncated; {0}+ hits)" -f $hitsArr.Count); break }

    $lineNo = "?"
    if ($null -ne $h -and $h.PSObject.Properties.Match("LineNumber").Count -gt 0) {
      $lineNo = $h.LineNumber
    }

    $lineTxt = ""
    if ($null -ne $h -and $h.PSObject.Properties.Match("Line").Count -gt 0) {
      $lineTxt = (TrimLine $h.Line)
    }

    Add-Line ("  [Line {0}] {1}" -f $lineNo, $lineTxt)

    $pre = @()
    $post = @()

    if ($null -ne $h -and $h.PSObject.Properties.Match("Context").Count -gt 0 -and $null -ne $h.Context) {
      $ctx = $h.Context
      if ($ctx.PSObject.Properties.Match("PreContext").Count -gt 0 -and $null -ne $ctx.PreContext) {
        $pre = To-Arr $ctx.PreContext
      }
      if ($ctx.PSObject.Properties.Match("PostContext").Count -gt 0 -and $null -ne $ctx.PostContext) {
        $post = To-Arr $ctx.PostContext
      }
    }

    foreach ($pl in (To-Arr $pre)) { if ($pl) { Add-Line ("        (pre)  {0}" -f (TrimLine $pl)) } }
    foreach ($pl in (To-Arr $post)) { if ($pl) { Add-Line ("        (post) {0}" -f (TrimLine $pl)) } }
  }

  return $hitsArr.Count
}

function List-FilesWithPattern {
  param(
    [string[]]$Paths,
    [string]$Pattern
  )
  $pathsArr = To-Arr $Paths
  if ($pathsArr.Count -eq 0) { return @() }

  $out = @()
  try {
    $hits = Select-String -Path $pathsArr -Pattern $Pattern -AllMatches -ErrorAction SilentlyContinue
    if ($hits) { $out = @($hits | Select-Object -ExpandProperty Path -Unique) }
  } catch { $out = @() }

  return @($out | Sort-Object -Unique)
}

function Count-MatchesInText([string]$raw, [string]$pattern) {
  if ($null -eq $raw) { return 0 }
  return ([regex]::Matches($raw, $pattern)).Count
}

function Normalize-RouteFromPath {
  param([string]$filePath)

  $p = $filePath -replace '\\','/'

  $idx = $p.ToLowerInvariant().LastIndexOf("/src/app/")
  if ($idx -ge 0) {
    $rel = $p.Substring($idx + "/src/app/".Length)
  } else {
    $idx2 = $p.ToLowerInvariant().LastIndexOf("/app/")
    if ($idx2 -ge 0) {
      $rel = $p.Substring($idx2 + "/app/".Length)
    } else {
      return $null
    }
  }

  $relDir = $rel -replace '/(page|layout|template|loading|error|not-found)\.(t|j)sx?$',''
  $relDir = $relDir.Trim('/')

  if (-not $relDir) { return "/" }

  $parts = @()
  foreach ($seg in ($relDir -split '/')) {
    if (-not $seg) { continue }

    if ($seg.StartsWith("(") -and $seg.EndsWith(")")) { continue }
    if ($seg.StartsWith("@")) { continue }

    if ($seg.StartsWith("[") -and $seg.EndsWith("]")) {
      $name = $seg.TrimStart("[").TrimEnd("]")
      if ($name.StartsWith("...")) {
        $name = $name.Substring(3)
        $parts += ("*{0}" -f $name)
      } else {
        $parts += (":{0}" -f $name)
      }
      continue
    }

    $parts += $seg
  }

  return ("/" + ($parts -join "/"))
}

function Detect-UseClient([string]$raw) {
  if ($null -eq $raw) { return $false }
  return [regex]::IsMatch($raw, '^(?s)\s*(/\*.*?\*/\s*)*(//.*\r?\n\s*)*["'']use client["'']\s*;')
}

function Detect-PageClientRefs([string]$raw) {
  if ($null -eq $raw) { return @() }
  $matches = [regex]::Matches($raw, '(?im)from\s+["''][^"'']*(PageClient|pageclient)[^"'']*["'']|import\s+[^;]*(PageClient|pageclient)')
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($m in $matches) {
    $line = $m.Value.Trim()
    if ($line) { [void]$out.Add($line) }
  }
  return @($out | Select-Object -Unique)
}

# ----------------------------- Patterns -----------------------------
$RX_APP_ROUTER_FILES = '(?i)(^|/)(page|layout|template|loading|error|not-found)\.(t|j)sx?$'

$RX_NEW_TOKENS   = '(?i)\bcontainer-page\b|shadow-soft|bg-subtle|ring-focus|text-\[var\(--|bg-\[var\(--|border-\[var\(--|from-\[#161748\]|via-\[#478559\]|to-\[#39a0ca\]'
$RX_CSSVAR_USES  = '(?i)(text|bg|border|ring)-\[\s*var\(--[a-z0-9_-]+\)\s*\]'
$RX_BRAND_GRAD   = '(?i)\bbg-gradient-to-(r|l|t|b)\b|\bfrom-\[#161748\]\b|\bvia-\[#478559\]\b|\bto-\[#39a0ca\]\b'

$RX_LEGACY_COLORS = '(?i)\b(bg|text|border|ring)-(white|black|gray-\d{2,3}|slate-\d{2,3}|zinc-\d{2,3}|neutral-\d{2,3}|stone-\d{2,3}|red-\d{2,3}|blue-\d{2,3}|green-\d{2,3})\b'
$RX_DARK_SATE     = '(?i)\bdark:(bg|text|border|ring)-(slate|gray|zinc|neutral|stone)-\d{2,3}\b'
$RX_HEX           = '#[0-9a-fA-F]{3,8}'
$RX_ARBITRARY_CLR = '(?i)\b(bg|text|border|ring|from|via|to)-\[#'

$RX_TAB_SIGNALS   = '(?i)\brole\s*=\s*["'']tablist["'']|\baria-selected\b|\bTabs\b|\bdata-state\s*=\s*["'']active["'']|\buseSearchParams\s*\(|\buseRouter\s*\(|router\.(push|replace)\(|\b\?t=|[?&]t\b'
$RX_NEXT_LINK     = '(?i)\bfrom\s+["'']next\/link["'']|\b<\s*Link\b'

# ----------------------------- Collect files -----------------------------
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

$appRoots = @()
foreach ($cand in @("src/app","app")) {
  $p = Join-Path $repoRoot $cand
  if (Test-Path -LiteralPath $p) { $appRoots += (Resolve-Path $p).Path }
}
$appRoots = @($appRoots | Sort-Object -Unique)

$routeFiles = @()
foreach ($r in $appRoots) {
  $routeFiles += @(
    Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue -Path $r |
      Where-Object { ($_.FullName -replace '\\','/') -match $RX_APP_ROUTER_FILES } |
      Select-Object -ExpandProperty FullName
  )
}
$routeFiles = @($routeFiles | Sort-Object -Unique)

$pageFiles = @($routeFiles | Where-Object { ($_ -replace '\\','/') -match '(?i)/page\.(t|j)sx?$' })

New-Item -ItemType Directory -Force $OutDir | Out-Null
$fullOut = Join-Path (Join-Path $repoRoot $OutDir) $OutFile
$fullCsv = Join-Path (Join-Path $repoRoot $OutDir) $OutCsv

# ----------------------------- Header -----------------------------
Add-Header "QwikSale scan: Pages + PageClient + Cosmetic token consistency + Tab behavior signals"
Add-Line ("Generated: {0}" -f (Get-Date))
Add-Line ("Repo:      {0}" -f $repoRoot)
Add-Line ("AppRoots:  {0}" -f (($appRoots -join ", ")))
Add-Line ("RouteFiles:{0}" -f (To-Arr $routeFiles).Count)
Add-Line ("Pages:     {0}" -f (To-Arr $pageFiles).Count)
Add-Line ("Out TXT:   {0}" -f $fullOut)
Add-Line ("Out CSV:   {0}" -f $fullCsv)

# ----------------------------- Route map -----------------------------
Add-Header "1) Route map (all pages detected)"
if ((To-Arr $pageFiles).Count -eq 0) {
  Add-Line "No App Router pages found (expected app/**/page.tsx)."
} else {
  $i = 0
  foreach ($p in $pageFiles) {
    $i++
    if ($i -gt $MaxFileList) { Add-Line ("(truncated; {0}+ pages)" -f (To-Arr $pageFiles).Count); break }
    $route = Normalize-RouteFromPath -filePath $p
    Add-Line ("{0,-36}  {1}" -f $route, $p)
  }
}

# ----------------------------- Analyze each page -----------------------------
$rows = New-Object System.Collections.Generic.List[object]

foreach ($pf in $pageFiles) {
  $raw = Safe-ReadRaw $pf
  $route = Normalize-RouteFromPath -filePath $pf

  $isClient = Detect-UseClient $raw

  $cssVarCount     = Count-MatchesInText $raw $RX_CSSVAR_USES
  $newTokenCount   = Count-MatchesInText $raw $RX_NEW_TOKENS
  $legacyCount     = Count-MatchesInText $raw $RX_LEGACY_COLORS
  $darkSlateCount  = Count-MatchesInText $raw $RX_DARK_SATE
  $hexCount        = Count-MatchesInText $raw $RX_HEX
  $arbCount        = Count-MatchesInText $raw $RX_ARBITRARY_CLR
  $brandGradCount  = Count-MatchesInText $raw $RX_BRAND_GRAD
  $tabSignalCount  = Count-MatchesInText $raw $RX_TAB_SIGNALS
  $linkSignalCount = Count-MatchesInText $raw $RX_NEXT_LINK

  $pageClientRefs = @(Detect-PageClientRefs $raw)
  $hasPageClient  = ((To-Arr $pageClientRefs).Count -gt 0)

  $score = 0
  $score += [Math]::Min(6, $cssVarCount)
  $score += [Math]::Min(4, $newTokenCount)
  $score += [Math]::Min(2, $brandGradCount)
  $score -= [Math]::Min(8, $legacyCount)
  $score -= [Math]::Min(4, $hexCount)
  $score -= [Math]::Min(4, $arbCount)

  $needsCosmeticTouch = $false
  if ($legacyCount -gt 0 -or $hexCount -gt 0 -or $arbCount -gt 0) { $needsCosmeticTouch = $true }
  if ($cssVarCount -eq 0 -and $newTokenCount -eq 0) { $needsCosmeticTouch = $true }

  $rows.Add([pscustomobject]@{
    Route = $route
    PageFile = $pf
    IsClient = $isClient
    HasPageClient = $hasPageClient
    CssVarUses = $cssVarCount
    NewTokenHits = $newTokenCount
    LegacyColorHits = $legacyCount
    DarkSlateHits = $darkSlateCount
    HexHits = $hexCount
    ArbitraryColorHits = $arbCount
    BrandGradientHits = $brandGradCount
    TabSignals = $tabSignalCount
    LinkSignals = $linkSignalCount
    Score = $score
    NeedsCosmeticTouch = $needsCosmeticTouch
  }) | Out-Null
}

# ----------------------------- Summary ranking -----------------------------
Add-Header "2) Summary: pages likely needing cosmetic alignment (ranked)"
if ($rows.Count -eq 0) {
  Add-Line "  (no pages analyzed)"
} else {
  # FIXED: multi-key sort syntax for PowerShell
  $sorted = $rows | Sort-Object `
    @{ Expression = "NeedsCosmeticTouch"; Descending = $true }, `
    @{ Expression = "Score"; Descending = $false }, `
    @{ Expression = "LegacyColorHits"; Descending = $true }, `
    @{ Expression = "HexHits"; Descending = $true }

  $i = 0
  foreach ($r in $sorted) {
    $i++
    if ($i -gt $MaxFileList) { Add-Line ("  (truncated; {0}+ rows)" -f $rows.Count); break }

    $flag = if ($r.NeedsCosmeticTouch) { "TOUCH" } else { "OK   " }
    $client = if ($r.IsClient) { "client" } else { "server" }
    $pc = if ($r.HasPageClient) { "PageClient" } else { "-" }

    Add-Line (("{0}  {1,-5}  score={2,3}  legacy={3,3}  hex={4,3}  var={5,3}  tabsig={6,3}  {7,-22}  {8}" -f `
      $flag, $client, $r.Score, $r.LegacyColorHits, $r.HexHits, $r.CssVarUses, $r.TabSignals, $r.Route, $pc))
    Add-Line ("      {0}" -f $r.PageFile)
  }
}

# ----------------------------- Focus lists -----------------------------
Add-Header "3) Focus lists (what to touch first)"

Add-Sub "A) Pages with legacy Tailwind palette usage (bg-white/text-gray/dark:bg-slate etc)"
$legacyPages = @($rows | Where-Object { $_.LegacyColorHits -gt 0 -or $_.DarkSlateHits -gt 0 } | Sort-Object LegacyColorHits -Descending)
if ((To-Arr $legacyPages).Count -eq 0) { Add-Line "  (none)" }
else {
  foreach ($r in $legacyPages) {
    Add-Line ("  {0,-28} legacy={1} darkSlate={2}  {3}" -f $r.Route, $r.LegacyColorHits, $r.DarkSlateHits, $r.PageFile)
  }
}

Add-Sub "B) Pages with hardcoded colors (#hex or bg-[#...])"
$hardcodedPages = @($rows | Where-Object { $_.HexHits -gt 0 -or $_.ArbitraryColorHits -gt 0 } | Sort-Object HexHits -Descending)
if ((To-Arr $hardcodedPages).Count -eq 0) { Add-Line "  (none)" }
else {
  foreach ($r in $hardcodedPages) {
    Add-Line ("  {0,-28} hex={1} arbitrary={2}  {3}" -f $r.Route, $r.HexHits, $r.ArbitraryColorHits, $r.PageFile)
  }
}

Add-Sub "C) Pages with tab behavior signals (places where tab UX likely lives)"
$tabPages = @($rows | Where-Object { $_.TabSignals -gt 0 } | Sort-Object TabSignals -Descending)
if ((To-Arr $tabPages).Count -eq 0) { Add-Line "  (none)" }
else {
  foreach ($r in $tabPages) {
    Add-Line ("  {0,-28} tabsig={1}  {2}" -f $r.Route, $r.TabSignals, $r.PageFile)
  }
}

Add-Sub "D) Pages NOT using CSS-var tokens at all (likely old look)"
$noVarPages = @($rows | Where-Object { $_.CssVarUses -eq 0 } | Sort-Object LegacyColorHits -Descending)
if ((To-Arr $noVarPages).Count -eq 0) { Add-Line "  (none)" }
else {
  foreach ($r in $noVarPages) {
    Add-Line ("  {0,-28} var=0 legacy={1}  {2}" -f $r.Route, $r.LegacyColorHits, $r.PageFile)
  }
}

# ----------------------------- PageClient inventory (repo-wide) -----------------------------
Add-Header "4) PageClient inventory (repo-wide, not only pages)"
$pageClientFiles = @()
foreach ($cf in $codeFiles) {
  if ($cf -match '(?i)PageClient\.(t|j)sx?$' -or $cf -match '(?i)page\.client\.(t|j)sx?$') {
    $pageClientFiles += $cf
  }
}
$pageClientFiles = @($pageClientFiles | Sort-Object -Unique)

if ((To-Arr $pageClientFiles).Count -eq 0) {
  Add-Line "  (no PageClient files detected by filename)"
} else {
  $i = 0
  foreach ($p in $pageClientFiles) {
    $i++
    if ($i -gt $MaxFileList) { Add-Line ("  (truncated; {0}+ files)" -f (To-Arr $pageClientFiles).Count); break }
    Add-Line ("  {0}" -f $p)
  }
}

Add-Sub "B) Pages that reference a PageClient import"
foreach ($pf in $pageFiles) {
  $raw = Safe-ReadRaw $pf
  $refs = @(Detect-PageClientRefs $raw)
  if ((To-Arr $refs).Count -eq 0) { continue }

  $route = Normalize-RouteFromPath -filePath $pf
  Add-Line ""
  Add-Line ("ROUTE: {0}" -f $route)
  Add-Line ("PAGE:  {0}" -f $pf)
  foreach ($r in $refs) { Add-Line ("  {0}" -f $r) }
}

# ----------------------------- Optional snippets (top offenders) -----------------------------
Add-Header "5) Snippets: cosmetic offenders (context lines)"
Add-Line "Tip: This is where you copy/paste fixes. It shows WHERE the old tokens occur."

# FIXED: multi-key sort syntax
$topOffenders = @(
  $rows | Sort-Object `
    @{ Expression = "LegacyColorHits"; Descending = $true }, `
    @{ Expression = "HexHits"; Descending = $true } |
  Select-Object -First 18
)

foreach ($r in $topOffenders) {
  if (-not $r.NeedsCosmeticTouch) { continue }
  Add-Sub ("Route {0}  (legacy={1} hex={2} arb={3} var={4})" -f $r.Route, $r.LegacyColorHits, $r.HexHits, $r.ArbitraryColorHits, $r.CssVarUses)
  Add-Line ("FILE: {0}" -f $r.PageFile)

  if ($r.LegacyColorHits -gt 0) {
    Add-Line "Legacy palette hits:"
    [void](Add-ContextHits -Path $r.PageFile -Pattern $RX_LEGACY_COLORS -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After $ContextAfter)
  }
  if ($r.HexHits -gt 0) {
    Add-Line "Hex hits:"
    [void](Add-ContextHits -Path $r.PageFile -Pattern $RX_HEX -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After $ContextAfter)
  }
  if ($r.ArbitraryColorHits -gt 0) {
    Add-Line "Arbitrary color hits (bg-[#...] etc):"
    [void](Add-ContextHits -Path $r.PageFile -Pattern $RX_ARBITRARY_CLR -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After $ContextAfter)
  }
  if ($r.TabSignals -gt 0) {
    Add-Line "Tab behavior signals:"
    [void](Add-ContextHits -Path $r.PageFile -Pattern $RX_TAB_SIGNALS -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After $ContextAfter)
  }
}

# ----------------------------- Write outputs -----------------------------
Set-Content -LiteralPath $fullOut -Value $Lines -Encoding UTF8 -Force

# FIXED: multi-key sort syntax
$rows |
  Sort-Object `
    @{ Expression = "NeedsCosmeticTouch"; Descending = $true }, `
    @{ Expression = "Score"; Descending = $false } |
  Export-Csv -LiteralPath $fullCsv -NoTypeInformation -Encoding UTF8 -Force

Write-Host ("Report written: {0}" -f $fullOut)
Write-Host ("CSV written:    {0}" -f $fullCsv)
