<#
  tools/scan-ui-theme.ps1
  -----------------------
  Scans the repo to map:
  - Light/Dark mechanism (Tailwind darkMode, next-themes, class toggles, prefers-color-scheme)
  - Tailwind theme tokens (colors/fonts/shadows/radius/spacing/plugins/content globs)
  - CSS variables (inventory + :root vs .dark/data-theme diffs)
  - Brand tokens vs hex/arbitrary colors usage
  - UI primitives usage/definitions (card/btn/input/etc)
  - Background texture signals (noise/grain/overlays/gradients)
  - Fonts (next/font, CSS font-family, --font-* vars, where applied)
  - Token compliance scan (legacy palette classes, non-approved gradients, brand* tokens, long dashes)
  - Heuristic scan for segmented controls not using pill helpers

  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\scan-ui-theme.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\scan-ui-theme.ps1 -OutDir tools\_reports
#>

param(
  # Writes into tools/_reports by default
  [string]$OutDir = "tools/_reports",
  [string]$OutFile = ("scan-ui-theme-{0}.txt" -f (Get-Date -Format "yyyyMMdd-HHmmss")),

  # Output tuning
  [int]$MaxFileList = 250,
  [int]$MaxHexHits = 150,
  [int]$MaxContextHitsPerFile = 18,
  [int]$ContextBefore = 2,
  [int]$ContextAfter = 6,

  # Compliance/offender reporting caps
  [int]$MaxOffenderLines = 220,
  [int]$MaxTopOffenders = 40
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ----------------------------- Utilities -----------------------------
function YesNo([bool]$b) { if ($b) { "YES" } else { "NO" } }

function To-Arr($x) {
  if ($null -eq $x) { Write-Output -NoEnumerate @(); return }
  Write-Output -NoEnumerate @($x)
} # force array wrapper for Count safety

function TrimLine([string]$s) { if ($null -eq $s) { "" } else { $s.TrimEnd() } }

function RelPath([string]$fullPath, [string]$root) {
  if (-not $fullPath) { return $fullPath }
  $rp = $fullPath
  try {
    $rp = (Resolve-Path -LiteralPath $fullPath -ErrorAction Stop).Path
  } catch {
    return $fullPath
  }

  $r = $root
  if (-not $r.EndsWith("\") -and -not $r.EndsWith("/")) { $r = $r + "\" }

  if ($rp.StartsWith($r, [System.StringComparison]::OrdinalIgnoreCase)) {
    return ".\" + $rp.Substring($r.Length)
  }
  return $fullPath
}

# ----------------------------- Patterns -----------------------------
# Theme / dark-mode drivers
$RX_TW_DARKMODE         = '(?i)\bdarkMode\s*:\s*["''](class|media)["'']'
$RX_NEXT_THEMES         = '(?i)\bnext-themes\b|\bThemeProvider\b|\buseTheme\s*\(|\bsetTheme\b|\bresolvedTheme\b|\benableSystem\b'
$RX_DARK_CLASSLIST      = '(?i)document\.documentElement\.classList|document\.body\.classList|classList\.(add|remove|toggle)\(\s*["'']dark["'']'
$RX_DATA_THEME          = '(?i)data-theme\s*='
$RX_PREFERS_COLORSCHEME = '(?i)prefers-color-scheme'

# Tailwind theme config suspects
$RX_TW_EXTEND_COLORS    = '(?i)\bextend\s*:\s*\{[\s\S]*?\bcolors\s*:'
$RX_TW_COLORS           = '(?i)\bcolors\s*:'
$RX_TW_FONTFAMILY       = '(?i)\bfontFamily\s*:'
$RX_TW_BOXSHADOW        = '(?i)\bboxShadow\s*:'
$RX_TW_BORDERRADIUS     = '(?i)\bborderRadius\s*:'
$RX_TW_SPACING          = '(?i)\bspacing\s*:'
$RX_TW_PLUGINS          = '(?i)\bplugins\s*:'
$RX_TW_CONTENT          = '(?i)\bcontent\s*:'

# CSS variables + base layers
$RX_CSS_ROOT            = '(?i):root\b'
$RX_CSS_DARK_SCOPE      = '(?i)\.dark\b|html\s*\[data-theme\s*=\s*["'']dark["'']\]|:root\s*\[data-theme\s*=\s*["'']dark["'']\]'
$RX_CSS_VAR_DEF         = '--[A-Za-z0-9_-]+\s*:'
$RX_CSS_LAYER           = '(?i)@layer\s+(base|components|utilities)'
$RX_CSS_APPLY           = '(?i)@apply\b'

# Color usage in code
$RX_BRAND_TOKENS        = '(?i)\bbrand[A-Za-z0-9_-]+\b'
$RX_HEX                 = '#[0-9a-fA-F]{3,8}'
$RX_TW_ARBITRARY_COLOR  = '(?i)\b(bg|text|border|ring|from|via|to)-\[#'
$RX_GRADIENTS           = '(?i)\bbg-gradient-to-|\bfrom-|\bvia-|\bto-|\blinear-gradient\b|\bradial-gradient\b|\bconic-gradient\b'

# Legacy palette (replace with var tokens)
$RX_LEGACY_PALETTE = '(?i)\b(bg|text|border|ring|from|via|to)-(white|black|gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-\d{1,3})?\b'

# Approved brand gradient only
$RX_APPROVED_BRAND_GRADIENT = '(?i)bg-gradient-to-r\s+from-\[#161748\]\s+via-\[#478559\]\s+to-\[#39a0ca\]'

# UI primitives (your global component classes)
$RX_PRIMITIVES      = '(?i)(^|[^A-Za-z0-9_-])(card|btn-gradient-primary|btn-outline|input|textarea|label|container-page|shadow-soft)([^A-Za-z0-9_-]|$)'
$RX_PRIMITIVE_DEFS  = '(?i)\.(card|btn-gradient-primary|btn-outline|input|textarea|label|container-page|shadow-soft)\b'

# Background/texture signals
$RX_BG_TEXTURE      = '(?i)\bnoise\b|\bgrain\b|\btexture\b|bg-\[url|background-image|backdrop-blur|blur-\d+|mix-blend|opacity-\d+|mask-image|\bfilter:\s*|\bbackdrop-filter\b'

# Fonts
$RX_NEXT_FONT       = '(?i)\bnext\/font\/(google|local)\b'
$RX_FONT_FAMILY     = '(?i)\bfont-family\s*:'
$RX_FONT_VAR        = '(?i)--font-[A-Za-z0-9_-]+'
$RX_HTML_BODY       = '(?i)<html\b|<body\b|\bclassName\s*=\s*{[^}]*\b(font|variable)\b'

# Package deps (hints)
$RX_PKG_THEME_DEPS  = '(?i)"tailwindcss"|"next-themes"|"shadcn"|"@radix-ui"|"class-variance-authority"|"tailwind-merge"|"clsx"|"lucide-react"|"@tailwindcss\/typography"|"@tailwindcss\/forms"'

# Long dash characters (en dash / em dash)
$RX_LONG_DASH       = "[\u2013\u2014]"

# Pills / segmented controls heuristic signals
$RX_PILL_HELPER_USE = '(?i)\bpillClass\s*\(|\bpillGroupClass\s*\(|\bpillIconClass\s*\('
$RX_TAB_SIGNALS     = '(?i)\baria-selected\b|\brole\s*=\s*["'']tab["'']|\bdata-state\s*=\s*["'']active["'']|\bTabs\b|\btablist\b|\bsegmented\b'

# ----------------------------- Output buffer -----------------------------
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
  } catch {
    $hits = @()
  }

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

    foreach ($pl in (To-Arr $pre)) {
      if ($pl) { Add-Line ("        (pre)  {0}" -f (TrimLine $pl)) }
    }
    foreach ($pl in (To-Arr $post)) {
      if ($pl) { Add-Line ("        (post) {0}" -f (TrimLine $pl)) }
    }
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

function Count-MatchesInFile {
  param(
    [string]$Path,
    [string]$Pattern
  )
  $raw = Safe-ReadRaw $Path
  if ($null -eq $raw) { return 0 }
  return ([regex]::Matches($raw, $Pattern)).Count
}

function Collect-CssVarNamesFromText([string]$raw) {
  $names = New-Object System.Collections.Generic.List[string]
  if ($null -eq $raw) { return $names }
  $ms = [regex]::Matches($raw, $RX_CSS_VAR_DEF)
  foreach ($m in $ms) {
    $name = ($m.Value -replace '\s*:.*$','').Trim()
    if ($name) { [void]$names.Add($name) }
  }
  return $names
}

function Collect-CssVars {
  param([string[]]$CssFiles)

  $vars = New-Object System.Collections.Generic.List[string]
  foreach ($p in (To-Arr $CssFiles)) {
    $raw = Safe-ReadRaw $p
    if ($null -eq $raw) { continue }
    $ms = Collect-CssVarNamesFromText $raw
    foreach ($n in $ms) { [void]$vars.Add($n) }
  }
  return $vars
}

function Extract-CssVarAssignmentsByScope {
  <#
    Attempts to extract CSS variable assignments within :root and within dark scopes.
    Heuristic (regex-based).
  #>
  param([string[]]$CssFiles)

  $rootMap = @{}
  $darkMap = @{}

  foreach ($p in (To-Arr $CssFiles)) {
    $raw = Safe-ReadRaw $p
    if ($null -eq $raw) { continue }

    # Grab :root blocks
    $rootBlocks = [regex]::Matches($raw, '(?is):root\s*\{([\s\S]*?)\}')
    foreach ($b in $rootBlocks) {
      $body = $b.Groups[1].Value
      $assigns = [regex]::Matches($body, '(?im)(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);')
      foreach ($a in $assigns) {
        $k = $a.Groups[1].Value.Trim()
        $v = $a.Groups[2].Value.Trim()
        if ($k) { $rootMap[$k] = $v }
      }
    }

    # Grab .dark and [data-theme="dark"] blocks
    $darkBlocks = [regex]::Matches($raw, '(?is)(\.dark\b[^{]*\{([\s\S]*?)\}|html\s*\[data-theme\s*=\s*["'']dark["'']\][^{]*\{([\s\S]*?)\}|:root\s*\[data-theme\s*=\s*["'']dark["'']\][^{]*\{([\s\S]*?)\})')
    foreach ($b in $darkBlocks) {
      $body = ""
      for ($gi=2; $gi -le 4; $gi++) {
        if ($b.Groups[$gi].Success -and $b.Groups[$gi].Value) { $body = $b.Groups[$gi].Value; break }
      }
      if (-not $body) { continue }

      $assigns = [regex]::Matches($body, '(?im)(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);')
      foreach ($a in $assigns) {
        $k = $a.Groups[1].Value.Trim()
        $v = $a.Groups[2].Value.Trim()
        if ($k) { $darkMap[$k] = $v }
      }
    }
  }

  return @{
    Root = $rootMap
    Dark = $darkMap
  }
}

function Emit-FileList {
  param(
    [string]$Title,
    [string[]]$Files,
    [string]$RepoRoot
  )
  Add-Sub $Title
  $arr = To-Arr $Files
  if ($arr.Count -eq 0) { Add-Line "  (none)" ; return }
  $i = 0
  foreach ($p in $arr) {
    $i++
    if ($i -gt $MaxFileList) { Add-Line ("  (truncated; {0}+ files)" -f $arr.Count); break }
    Add-Line ("  {0}" -f (RelPath $p $RepoRoot))
  }
}

function Emit-OffendersWithLines {
  param(
    [string]$Title,
    [string[]]$Paths,
    [string]$Pattern,
    [int]$MaxLines,
    [int]$Before,
    [int]$After,
    [string]$RepoRoot
  )

  Add-Sub $Title

  $pathsArr = To-Arr $Paths
  if ($pathsArr.Count -eq 0) { Add-Line "  (no files)"; return }

  $linesOut = 0
  try {
    $hits = Select-String -Path $pathsArr -Pattern $Pattern -AllMatches -Context $Before,$After -ErrorAction SilentlyContinue |
      Sort-Object Path, LineNumber
  } catch {
    Add-Line "  (scan failed)"
    return
  }

  if (-not $hits) {
    Add-Line "  (no hits)"
    return
  }

  foreach ($h in $hits) {
    $linesOut++
    if ($linesOut -gt $MaxLines) {
      Add-Line ("  (truncated; more hits exist)")
      break
    }
    Add-Line ("  {0}:{1}  {2}" -f (RelPath $h.Path $RepoRoot), $h.LineNumber, (TrimLine $h.Line))
  }
}

function Top-OffendersByCount {
  param(
    [string]$Label,
    [string[]]$Paths,
    [string]$Pattern,
    [int]$TopN,
    [string]$RepoRoot
  )

  $rows = New-Object System.Collections.Generic.List[object]
  foreach ($p in (To-Arr $Paths)) {
    $c = Count-MatchesInFile -Path $p -Pattern $Pattern
    if ($c -gt 0) {
      $rows.Add([pscustomobject]@{ Path = $p; Count = $c }) | Out-Null
    }
  }

  Add-Sub $Label
  if ($rows.Count -eq 0) { Add-Line "  (none)"; return }

  $sorted = $rows | Sort-Object Count -Descending, Path
  $i = 0
  foreach ($r in $sorted) {
    $i++
    if ($i -gt $TopN) { break }
    Add-Line ("  {0}  ({1})" -f (RelPath $r.Path $RepoRoot), $r.Count)
  }
}

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

$cssFiles = @(
  $all |
    Where-Object { $_.Extension -in ".css",".scss",".sass",".less" } |
    Select-Object -ExpandProperty FullName
)

$mdFiles = @(
  $all |
    Where-Object { $_.Extension -in ".md",".mdx" } |
    Select-Object -ExpandProperty FullName
)

# Root-level configs (plus common alt locations)
$configFiles = @()
$configFiles += @(Get-ChildItem -File -ErrorAction SilentlyContinue -Path $repoRoot -Filter "tailwind.config.*" | Select-Object -ExpandProperty FullName)
$configFiles += @(Get-ChildItem -File -ErrorAction SilentlyContinue -Path $repoRoot -Filter "postcss.config.*"   | Select-Object -ExpandProperty FullName)
$configFiles += @(Get-ChildItem -File -ErrorAction SilentlyContinue -Path $repoRoot -Filter "next.config.*"     | Select-Object -ExpandProperty FullName)
$configFiles += @(Get-ChildItem -File -ErrorAction SilentlyContinue -Path $repoRoot -Filter "package.json"      | Select-Object -ExpandProperty FullName)

# likely app-shell files
$layoutFiles = @()
try {
  foreach ($base in @("src","app")) {
    $p = Join-Path $repoRoot $base
    if (-not (Test-Path -LiteralPath $p)) { continue }
    $layoutFiles += @(Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue -Path $p |
      Where-Object { $_.Name -ieq "layout.tsx" -or $_.Name -ieq "layout.ts" } |
      Select-Object -ExpandProperty FullName)
  }
} catch { $layoutFiles = @() }
$layoutFiles = @($layoutFiles | Sort-Object -Unique)

# global CSS candidates
$globalsFiles = @()
try {
  foreach ($base in @("src","app","styles")) {
    $p = Join-Path $repoRoot $base
    if (-not (Test-Path -LiteralPath $p)) { continue }
    $globalsFiles += @(Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue -Path $p |
      Where-Object { $_.Name -match '(?i)globals\.css$|global\.css$|app\.css$' } |
      Select-Object -ExpandProperty FullName)
  }
} catch { $globalsFiles = @() }
$globalsFiles = @($globalsFiles | Sort-Object -Unique)

New-Item -ItemType Directory -Force $OutDir | Out-Null
$fullOut = Join-Path (Join-Path $repoRoot $OutDir) $OutFile

# ----------------------------- Header -----------------------------
Add-Header "QwikSale scan: UI theme + light/dark mapping + fonts + look & feel inventory"
Add-Line ("Generated: {0}" -f (Get-Date))
Add-Line ("Repo:      {0}" -f $repoRoot)
Add-Line ("Code:      {0} files" -f (To-Arr $codeFiles).Count)
Add-Line ("CSS:       {0} files" -f (To-Arr $cssFiles).Count)
Add-Line ("MD:        {0} files" -f (To-Arr $mdFiles).Count)
Add-Line ("Configs:   {0} files" -f (To-Arr $configFiles).Count)
Add-Line ("Out:       {0}" -f $fullOut)

# ----------------------------- 0) Key config locations -----------------------------
Add-Header "0) Key files (where your design system usually lives)"
Emit-FileList -Title "Tailwind / PostCSS / Next / package.json found" -Files (@($configFiles | Sort-Object -Unique)) -RepoRoot $repoRoot
Emit-FileList -Title "Likely global CSS file(s)" -Files (@($globalsFiles | Sort-Object -Unique)) -RepoRoot $repoRoot
Emit-FileList -Title "Likely layout file(s) (where fonts/theme providers attach to html/body)" -Files (@($layoutFiles | Sort-Object -Unique)) -RepoRoot $repoRoot

# ----------------------------- 1) Dark mode + theme mechanism -----------------------------
Add-Header "1) Dark mode + theme mechanism (how light/dark is decided & applied)"

Add-Sub "A) Tailwind darkMode setting (tailwind.config.*)"
$twFiles = @($configFiles | Where-Object { $_ -match '(?i)tailwind\.config\.' })
if ((To-Arr $twFiles).Count -eq 0) {
  Add-Line "  (no tailwind config detected)"
} else {
  foreach ($cfg in $twFiles) {
    Add-Line ""
    Add-Line ("FILE: {0}" -f (RelPath $cfg $repoRoot))
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_DARKMODE -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After $ContextAfter)
  }
}

Add-Sub "B) Theme providers / next-themes / theme toggles"
$themeFiles = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_NEXT_THEMES)
if ((To-Arr $themeFiles).Count -eq 0) { Add-Line "  (no next-themes / ThemeProvider usage found)" }
else { Emit-FileList -Title "Files with next-themes / ThemeProvider signals" -Files $themeFiles -RepoRoot $repoRoot }

Add-Sub "C) Direct dark class toggling (documentElement/body classList)"
$darkToggleFiles = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_DARK_CLASSLIST)
if ((To-Arr $darkToggleFiles).Count -eq 0) { Add-Line "  (no direct dark classList toggling found)" }
else { Emit-FileList -Title "Files toggling 'dark' class directly" -Files $darkToggleFiles -RepoRoot $repoRoot }

Add-Sub "D) data-theme attribute usage"
$dataThemeFiles = @(List-FilesWithPattern -Paths ($codeFiles + $cssFiles) -Pattern $RX_DATA_THEME)
if ((To-Arr $dataThemeFiles).Count -eq 0) { Add-Line "  (no data-theme usage found)" }
else { Emit-FileList -Title "Files referencing data-theme" -Files $dataThemeFiles -RepoRoot $repoRoot }

Add-Sub "E) prefers-color-scheme usage (system theme detection)"
$prefFiles = @(List-FilesWithPattern -Paths ($codeFiles + $cssFiles) -Pattern $RX_PREFERS_COLORSCHEME)
if ((To-Arr $prefFiles).Count -eq 0) { Add-Line "  (no prefers-color-scheme usage found)" }
else { Emit-FileList -Title "Files referencing prefers-color-scheme" -Files $prefFiles -RepoRoot $repoRoot }

# ----------------------------- 2) CSS variables & base layers -----------------------------
Add-Header "2) CSS tokens (variables), base layers, and how light/dark differs"

Add-Sub "A) Files containing :root / .dark scopes"
$rootCss = @(List-FilesWithPattern -Paths $cssFiles -Pattern $RX_CSS_ROOT)
$darkCss = @(List-FilesWithPattern -Paths $cssFiles -Pattern $RX_CSS_DARK_SCOPE)

Add-Line ("  :root files:           {0}" -f (To-Arr $rootCss).Count)
foreach ($p in (To-Arr $rootCss)) { Add-Line ("    {0}" -f (RelPath $p $repoRoot)) }
Add-Line ("  .dark/data-theme files:{0}" -f (To-Arr $darkCss).Count)
foreach ($p in (To-Arr $darkCss)) { Add-Line ("    {0}" -f (RelPath $p $repoRoot)) }

Add-Sub "B) CSS variable inventory (unique var names + counts)"
$vars = Collect-CssVars -CssFiles $cssFiles
if ((To-Arr $vars).Count -eq 0) {
  Add-Line "  (no CSS variables found)"
} else {
  $uniq = $vars | Group-Object | Sort-Object Count -Descending
  Add-Line ("  Total var defs: {0}" -f (To-Arr $vars).Count)
  Add-Line ("  Unique vars:    {0}" -f (To-Arr $uniq).Count)
  Add-Line ""
  Add-Line "  Top variables by frequency (up to 60):"
  $i = 0
  foreach ($g in $uniq) {
    $i++
    if ($i -gt 60) { break }
    Add-Line ("    {0}  ({1})" -f $g.Name, $g.Count)
  }
}

Add-Sub "C) :root vs .dark variable assignment diff (best-effort)"
$maps = Extract-CssVarAssignmentsByScope -CssFiles $cssFiles
$rootMap = $maps.Root
$darkMap = $maps.Dark

Add-Line ("  root assignments: {0}" -f (To-Arr $rootMap.Keys).Count)
Add-Line ("  dark assignments: {0}" -f (To-Arr $darkMap.Keys).Count)

if ((To-Arr $rootMap.Keys).Count -gt 0 -or (To-Arr $darkMap.Keys).Count -gt 0) {
  $allKeys = @($rootMap.Keys + $darkMap.Keys | Sort-Object -Unique)

  $changed = New-Object System.Collections.Generic.List[string]
  $onlyRoot = New-Object System.Collections.Generic.List[string]
  $onlyDark = New-Object System.Collections.Generic.List[string]

  foreach ($k in $allKeys) {
    $hasR = $rootMap.ContainsKey($k)
    $hasD = $darkMap.ContainsKey($k)
    if ($hasR -and $hasD) {
      if ($rootMap[$k] -ne $darkMap[$k]) { [void]$changed.Add($k) }
    } elseif ($hasR) {
      [void]$onlyRoot.Add($k)
    } elseif ($hasD) {
      [void]$onlyDark.Add($k)
    }
  }

  Add-Line ""
  Add-Line ("  Vars changed between light and dark: {0}" -f (To-Arr $changed).Count)
  $i = 0
  foreach ($k in $changed) {
    $i++; if ($i -gt 60) { Add-Line "    (truncated)"; break }
    Add-Line ("    {0} : root='{1}'  dark='{2}'" -f $k, $rootMap[$k], $darkMap[$k])
  }

  Add-Line ""
  Add-Line ("  Vars only in :root: {0}" -f (To-Arr $onlyRoot).Count)
  $i = 0
  foreach ($k in $onlyRoot) {
    $i++; if ($i -gt 40) { Add-Line "    (truncated)"; break }
    Add-Line ("    {0} : '{1}'" -f $k, $rootMap[$k])
  }

  Add-Line ""
  Add-Line ("  Vars only in dark scope: {0}" -f (To-Arr $onlyDark).Count)
  $i = 0
  foreach ($k in $onlyDark) {
    $i++; if ($i -gt 40) { Add-Line "    (truncated)"; break }
    Add-Line ("    {0} : '{1}'" -f $k, $darkMap[$k])
  }
} else {
  Add-Line "  (no variable assignment blocks detected)"
}

Add-Sub "D) @layer and @apply usage (signals custom component classes / design tokens)"
$layerFiles = @(List-FilesWithPattern -Paths $cssFiles -Pattern $RX_CSS_LAYER)
$applyFiles = @(List-FilesWithPattern -Paths $cssFiles -Pattern $RX_CSS_APPLY)
Add-Line ("  @layer files: {0}" -f (To-Arr $layerFiles).Count)
foreach ($p in (To-Arr $layerFiles)) { Add-Line ("    {0}" -f (RelPath $p $repoRoot)) }
Add-Line ("  @apply files: {0}" -f (To-Arr $applyFiles).Count)
foreach ($p in (To-Arr $applyFiles)) { Add-Line ("    {0}" -f (RelPath $p $repoRoot)) }

# ----------------------------- 3) Tailwind theme tokens -----------------------------
Add-Header "3) Tailwind theme tokens (colors, fonts, shadows, radius)"

if ((To-Arr $twFiles).Count -eq 0) {
  Add-Line "  (no tailwind config detected)"
} else {
  foreach ($cfg in $twFiles) {
    Add-Line ""
    Add-Line ("FILE: {0}" -f (RelPath $cfg $repoRoot))

    Add-Line "  A) colors / extend.colors"
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_EXTEND_COLORS -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After 12)
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_COLORS -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After 10)

    Add-Line "  B) fontFamily"
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_FONTFAMILY -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After 10)

    Add-Line "  C) boxShadow / borderRadius / spacing"
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_BOXSHADOW -MaxHits 10 -Before $ContextBefore -After 10)
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_BORDERRADIUS -MaxHits 10 -Before $ContextBefore -After 10)
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_SPACING -MaxHits 10 -Before $ContextBefore -After 10)

    Add-Line "  D) content globs / plugins"
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_CONTENT -MaxHits 12 -Before $ContextBefore -After 10)
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_PLUGINS -MaxHits 12 -Before $ContextBefore -After 12)
  }
}

# ----------------------------- 4) Color usage: tokens vs hardcoded -----------------------------
Add-Header "4) Color usage in UI: brand tokens vs hardcoded colors"

Emit-FileList -Title "A) Brand token usage (brand*) - files" -Files (List-FilesWithPattern -Paths ($codeFiles + $cssFiles) -Pattern $RX_BRAND_TOKENS) -RepoRoot $repoRoot

Add-Sub "B) Hardcoded hex usage - sample hits"
try {
  $hexHits = Select-String -Path ($codeFiles + $cssFiles) -Pattern $RX_HEX -AllMatches -ErrorAction SilentlyContinue |
    Sort-Object Path, LineNumber
  if (-not $hexHits) {
    Add-Line "  (no hex colors found)"
  } else {
    $i = 0
    foreach ($h in $hexHits) {
      $i++
      if ($i -gt $MaxHexHits) { Add-Line ("  (truncated; {0}+ hits)" -f (To-Arr $hexHits).Count); break }
      Add-Line ("  {0}:{1}  {2}" -f (RelPath $h.Path $repoRoot), $h.LineNumber, (TrimLine $h.Line))
    }
  }
} catch { Add-Line "  (scan failed)" }

Emit-FileList -Title "C) Tailwind arbitrary colors (bg-[#...]/from-[#...]) - offenders" -Files (List-FilesWithPattern -Paths $codeFiles -Pattern $RX_TW_ARBITRARY_COLOR) -RepoRoot $repoRoot

# ----------------------------- 5) UI primitives map -----------------------------
Add-Header "5) UI primitives map (where to change the look safely)"

$primUse = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_PRIMITIVES)
if ((To-Arr $primUse).Count -eq 0) {
  Add-Line "  (no primitive class usage found)"
} else {
  Emit-FileList -Title "A) Where primitives are USED (card/btn/input/textarea/etc)" -Files $primUse -RepoRoot $repoRoot
}

$primDefs = @(List-FilesWithPattern -Paths $cssFiles -Pattern $RX_PRIMITIVE_DEFS)
if ((To-Arr $primDefs).Count -eq 0) {
  Add-Line ""
  Add-Line "B) Where primitives are DEFINED (CSS class definitions)"
  Add-Line "  (no primitive class definitions found in CSS)"
} else {
  Emit-FileList -Title "B) Where primitives are DEFINED (CSS class definitions)" -Files $primDefs -RepoRoot $repoRoot

  Add-Sub "C) Context: primitive definitions (snippets)"
  foreach ($p in $primDefs) {
    Add-Line ""
    Add-Line ("FILE: {0}" -f (RelPath $p $repoRoot))
    [void](Add-ContextHits -Path $p -Pattern $RX_PRIMITIVE_DEFS -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After $ContextAfter)
  }
}

# ----------------------------- 6) Fonts -----------------------------
Add-Header "6) Fonts (source of truth, and where its applied)"

$fontImportFiles = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_NEXT_FONT)
$fontCssFiles    = @(List-FilesWithPattern -Paths $cssFiles -Pattern $RX_FONT_FAMILY)
$fontVarFiles    = @(List-FilesWithPattern -Paths ($codeFiles + $cssFiles) -Pattern $RX_FONT_VAR)

Emit-FileList -Title "A) next/font usage (google/local)" -Files $fontImportFiles -RepoRoot $repoRoot
Emit-FileList -Title "B) font-family declarations in CSS" -Files $fontCssFiles -RepoRoot $repoRoot
Emit-FileList -Title "C) font variables (--font-*)" -Files $fontVarFiles -RepoRoot $repoRoot

Add-Sub "D) layout/html/body wiring (where font className attaches)"
if ((To-Arr $layoutFiles).Count -eq 0) { Add-Line "  (no layout files detected)" }
else {
  foreach ($p in $layoutFiles) {
    Add-Line ""
    Add-Line ("FILE: {0}" -f (RelPath $p $repoRoot))
    [void](Add-ContextHits -Path $p -Pattern $RX_NEXT_FONT -MaxHits 12 -Before $ContextBefore -After $ContextAfter)
    [void](Add-ContextHits -Path $p -Pattern $RX_HTML_BODY -MaxHits 12 -Before $ContextBefore -After $ContextAfter)
    [void](Add-ContextHits -Path $p -Pattern $RX_FONT_VAR -MaxHits 12 -Before $ContextBefore -After $ContextAfter)
  }
}

# ----------------------------- 7) Backgrounds / texture -----------------------------
Add-Header "7) Background & texture signals"

$gradFiles = @(List-FilesWithPattern -Paths ($codeFiles + $cssFiles) -Pattern $RX_GRADIENTS)
$texFiles  = @(List-FilesWithPattern -Paths ($codeFiles + $cssFiles) -Pattern $RX_BG_TEXTURE)

Emit-FileList -Title "A) Gradient usage (Tailwind + CSS gradients)" -Files $gradFiles -RepoRoot $repoRoot
Emit-FileList -Title "B) Texture/noise/overlay patterns" -Files $texFiles -RepoRoot $repoRoot

# ----------------------------- 8) Package hints -----------------------------
Add-Header "8) Package hints (what UI tooling is installed)"

$pkg = Join-Path $repoRoot "package.json"
if (Test-Path -LiteralPath $pkg) {
  Add-Line ("FILE: {0}" -f (RelPath $pkg $repoRoot))
  [void](Add-ContextHits -Path $pkg -Pattern $RX_PKG_THEME_DEPS -MaxHits 70 -Before 0 -After 0)
} else {
  Add-Line "  (package.json not found in repo root)"
}

# ----------------------------- 9) Token compliance scans -----------------------------
Add-Header "9) Token compliance scans (offenders that still need UI upgrades)"

Top-OffendersByCount -Label "A) Top offenders: legacy palette utility classes (should be var tokens)" -Paths $codeFiles -Pattern $RX_LEGACY_PALETTE -TopN $MaxTopOffenders -RepoRoot $repoRoot
Emit-OffendersWithLines -Title "A1) Sample legacy palette hits (line list)" -Paths $codeFiles -Pattern $RX_LEGACY_PALETTE -MaxLines $MaxOffenderLines -Before 0 -After 0 -RepoRoot $repoRoot

Top-OffendersByCount -Label "B) Top offenders: Tailwind arbitrary colors (bg-[#...]/from-[#...])" -Paths $codeFiles -Pattern $RX_TW_ARBITRARY_COLOR -TopN $MaxTopOffenders -RepoRoot $repoRoot
Emit-OffendersWithLines -Title "B1) Sample arbitrary color hits (line list)" -Paths $codeFiles -Pattern $RX_TW_ARBITRARY_COLOR -MaxLines $MaxOffenderLines -Before 0 -After 0 -RepoRoot $repoRoot

Top-OffendersByCount -Label "C) Top offenders: raw hex literals (#...)" -Paths ($codeFiles + $cssFiles) -Pattern $RX_HEX -TopN $MaxTopOffenders -RepoRoot $repoRoot

Add-Sub "D) Non-approved gradients (heuristic)"
try {
  $gradHits = Select-String -Path $codeFiles -Pattern $RX_GRADIENTS -AllMatches -ErrorAction SilentlyContinue |
    Sort-Object Path, LineNumber
  if (-not $gradHits) {
    Add-Line "  (no gradients found)"
  } else {
    $i = 0
    foreach ($h in $gradHits) {
      $line = (TrimLine $h.Line)
      $isApproved = [regex]::IsMatch($line, $RX_APPROVED_BRAND_GRADIENT)
      if ($isApproved) { continue }
      $i++
      if ($i -gt $MaxOffenderLines) { Add-Line "  (truncated)"; break }
      Add-Line ("  {0}:{1}  {2}" -f (RelPath $h.Path $repoRoot), $h.LineNumber, $line)
    }
    if ($i -eq 0) { Add-Line "  (only approved brand gradient found in gradient lines sampled)" }
  }
} catch {
  Add-Line "  (scan failed)"
}

Top-OffendersByCount -Label "E) Top offenders: brand* tokens (legacy palette/conventions)" -Paths ($codeFiles + $cssFiles) -Pattern $RX_BRAND_TOKENS -TopN $MaxTopOffenders -RepoRoot $repoRoot
Emit-OffendersWithLines -Title "E1) Sample brand* token hits (line list)" -Paths ($codeFiles + $cssFiles) -Pattern $RX_BRAND_TOKENS -MaxLines $MaxOffenderLines -Before 0 -After 0 -RepoRoot $repoRoot

Top-OffendersByCount -Label "F) Top offenders: long dashes (en dash/em dash) - replace with normal hyphen" -Paths ($codeFiles + $mdFiles) -Pattern $RX_LONG_DASH -TopN $MaxTopOffenders -RepoRoot $repoRoot
Emit-OffendersWithLines -Title "F1) Sample long dash hits (line list)" -Paths ($codeFiles + $mdFiles) -Pattern $RX_LONG_DASH -MaxLines $MaxOffenderLines -Before 0 -After 0 -RepoRoot $repoRoot

Add-Sub "G) Possible segmented controls not using pill helpers (heuristic)"
try {
  $tabFiles = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_TAB_SIGNALS)
  if ((To-Arr $tabFiles).Count -eq 0) {
    Add-Line "  (no tab/segmented signals found)"
  } else {
    $missing = @()
    foreach ($p in $tabFiles) {
      if (Count-MatchesInFile -Path $p -Pattern $RX_PILL_HELPER_USE -eq 0) {
        $missing += $p
      }
    }

    if ((To-Arr $missing).Count -eq 0) {
      Add-Line "  (all tab-signal files also reference pill helpers)"
    } else {
      Add-Line "  Files with tab/segmented signals but no pill helpers:"
      $i = 0
      foreach ($p in ($missing | Sort-Object -Unique)) {
        $i++
        if ($i -gt $MaxFileList) { Add-Line "  (truncated)"; break }
        Add-Line ("  - {0}" -f (RelPath $p $repoRoot))
      }
    }
  }
} catch {
  Add-Line "  (scan failed)"
}

# ----------------------------- 10) Summary -----------------------------
Add-Header "10) Heuristic summary (quick takeaways)"

$darkModeGuess = "unknown"
foreach ($cfg in $twFiles) {
  $raw = Safe-ReadRaw $cfg
  if ($null -eq $raw) { continue }
  $m = [regex]::Match($raw, $RX_TW_DARKMODE)
  if ($m.Success) { $darkModeGuess = $m.Groups[1].Value.ToLowerInvariant(); break }
}

$hasNextThemes = ((To-Arr $themeFiles).Count -gt 0)
$hasCssVars    = ((To-Arr $vars).Count -gt 0)

$hexCount = 0
$brandCount = 0
$legacyCount = 0
$arbitraryCount = 0

foreach ($p in (To-Arr $codeFiles)) {
  $hexCount += Count-MatchesInFile -Path $p -Pattern $RX_HEX
  $brandCount += Count-MatchesInFile -Path $p -Pattern $RX_BRAND_TOKENS
  $legacyCount += Count-MatchesInFile -Path $p -Pattern $RX_LEGACY_PALETTE
  $arbitraryCount += Count-MatchesInFile -Path $p -Pattern $RX_TW_ARBITRARY_COLOR
}

Add-Line ("Tailwind darkMode:                  {0}" -f $darkModeGuess)
Add-Line ("next-themes / ThemeProvider:        {0}" -f (YesNo $hasNextThemes))
Add-Line ("CSS variables present:              {0}" -f (YesNo $hasCssVars))
Add-Line ("Approx hardcoded hex uses (code):   {0}" -f $hexCount)
Add-Line ("Approx brand* token uses (code):    {0}" -f $brandCount)
Add-Line ("Approx legacy palette uses (code):  {0}" -f $legacyCount)
Add-Line ("Approx arbitrary color uses (code): {0}" -f $arbitraryCount)
Add-Line ("Gradient signal files:              {0}" -f (To-Arr $gradFiles).Count)
Add-Line ("Texture/overlay signal files:       {0}" -f (To-Arr $texFiles).Count)

Add-Line ""
Add-Line "Interpretation:"
if (-not $hasCssVars) {
  Add-Line "  - Theme is likely Tailwind utility-first with dark: variants and/or scattered raw colors."
  Add-Line "  - Centralizing surfaces via CSS vars will remove mismatch quickly."
} else {
  Add-Line "  - CSS vars exist. Most remaining work is hunting legacy palette/arbitrary colors in components."
}
if ($arbitraryCount -gt 0) {
  Add-Line "  - Arbitrary colors still exist. Under your rules these should be removed (except the approved brand strip)."
}
if ($legacyCount -gt 0) {
  Add-Line "  - Legacy palette utilities still exist. Replace with bg-[var(--bg)] / border-[var(--border-subtle)] / text tokens."
}

Add-Header "DONE"
Add-Line ("Report written: {0}" -f $fullOut)

Set-Content -LiteralPath $fullOut -Value $Lines -Encoding UTF8 -Force
Write-Host ("Report written: {0}" -f $fullOut)
