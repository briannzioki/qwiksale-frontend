<#
  tools/scan-ui-theme.ps1
  =======================
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
  - Auth/sign-in hazards that can break Playwright (layout wrapper forms, nested forms, GET submissions)

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
function Get-YesNo([bool]$b) { if ($b) { "YES" } else { "NO" } }

function ConvertTo-Array($x) {
  # IMPORTANT:
  # - Must NEVER return $null (even for empty arrays)
  # - Must preserve enumeration for collections (List[T], Dictionary keys, etc.)
  # - Must NOT split strings into characters
  $arr = @()

  if ($null -eq $x) {
    $arr = @()
  }
  elseif ($x -is [string]) {
    $arr = @($x)
  }
  elseif ($x -is [System.Array]) {
    $arr = $x
  }
  elseif ($x -is [System.Collections.IDictionary]) {
    # Treat dictionaries as a single object by default (avoid enumerating keys/entries unexpectedly)
    $arr = @($x)
  }
  elseif ($x -is [System.Collections.IEnumerable]) {
    $arr = @($x) # enumerate lists/collections (safe)
  }
  else {
    $arr = @($x)
  }

  # Ensure caller always receives an array object (even empty) with .Count
  Write-Output -NoEnumerate $arr
}

function ConvertTo-TrimmedLine([string]$s) {
  if ($null -eq $s) { return "" }
  return $s.TrimEnd()
}

function ConvertTo-RelativePath([string]$fullPath, [string]$root) {
  if (-not $fullPath) { return $fullPath }

  $rp = $fullPath
  try { $rp = (Resolve-Path -LiteralPath $fullPath -ErrorAction Stop).Path } catch { return $fullPath }

  $r = $root
  if (-not $r.EndsWith("\") -and -not $r.EndsWith("/")) { $r = $r + "\" }

  if ($rp.StartsWith($r, [System.StringComparison]::OrdinalIgnoreCase)) {
    return ".\" + $rp.Substring($r.Length)
  }
  return $fullPath
}

function Get-FileText([string]$Path) {
  try { return Get-Content -LiteralPath $Path -Raw -ErrorAction Stop } catch { return $null }
}

function Resolve-OutDir([string]$RepoRoot, [string]$OutDirValue) {
  if ([System.IO.Path]::IsPathRooted($OutDirValue)) { return $OutDirValue }
  return (Join-Path $RepoRoot $OutDirValue)
}

# ----------------------------- Patterns -----------------------------
# Theme / dark-mode drivers
$RX_TW_DARKMODE         = "(?i)\bdarkMode\s*:\s*[`"`'](class|media)[`"`']"
$RX_NEXT_THEMES         = "(?i)\bnext-themes\b|\bThemeProvider\b|\buseTheme\s*\(|\bsetTheme\b|\bresolvedTheme\b|\benableSystem\b"
$RX_DARK_CLASSLIST      = "(?i)document\.documentElement\.classList|document\.body\.classList|classList\.(add|remove|toggle)\(\s*[`"`']dark[`"`']"
$RX_DATA_THEME          = "(?i)data-theme\s*="
$RX_PREFERS_COLORSCHEME = "(?i)prefers-color-scheme"

# Tailwind theme config suspects
$RX_TW_COLORS           = "(?i)\b(colors|extend)\s*:\s*\{"
$RX_TW_FONTFAMILY       = "(?i)\bfontFamily\s*:"
$RX_TW_BOXSHADOW        = "(?i)\bboxShadow\s*:"
$RX_TW_BORDERRADIUS     = "(?i)\bborderRadius\s*:"
$RX_TW_SPACING          = "(?i)\bspacing\s*:"
$RX_TW_PLUGINS          = "(?i)\bplugins\s*:"
$RX_TW_CONTENT          = "(?i)\bcontent\s*:"

# CSS variables + base layers
$RX_CSS_ROOT            = "(?i):root\b"
$RX_CSS_DARK_SCOPE      = "(?i)\.dark\b|html\s*\[data-theme\s*=\s*[`"`']dark[`"`']\]|:root\s*\[data-theme\s*=\s*[`"`']dark[`"`']\]"
$RX_CSS_VAR_DEF         = "--[A-Za-z0-9_-]+\s*:"
$RX_CSS_LAYER           = "(?i)@layer\s+(base|components|utilities)"
$RX_CSS_APPLY           = "(?i)@apply\b"

# Color usage in code
$RX_BRAND_TOKENS        = "(?i)\bbrand[A-Za-z0-9_-]+\b"
$RX_HEX                 = "#[0-9a-fA-F]{3,8}"
$RX_TW_ARBITRARY_COLOR  = "(?i)\b(bg|text|border|ring|from|via|to)-\[#"
$RX_GRADIENTS           = "(?i)\bbg-gradient-to-|\bfrom-|\bvia-|\bto-|\blinear-gradient\b|\bradial-gradient\b|\bconic-gradient\b"

# Legacy palette (replace with var tokens)
$RX_LEGACY_PALETTE      = "(?i)\b(bg|text|border|ring|from|via|to)-(white|black|gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-\d{1,3})?\b"

# Approved brand gradient only
$RX_APPROVED_BRAND_GRADIENT = "(?i)bg-gradient-to-r\s+from-\[#161748\]\s+via-\[#478559\]\s+to-\[#39a0ca\]"

# UI primitives (global component classes)
$RX_PRIMITIVES      = "(?i)(^|[^A-Za-z0-9_-])(card|btn-gradient-primary|btn-outline|input|textarea|label|container-page|shadow-soft)([^A-Za-z0-9_-]|$)"
$RX_PRIMITIVE_DEFS  = "(?i)\.(card|btn-gradient-primary|btn-outline|input|textarea|label|container-page|shadow-soft)\b"

# Background/texture signals
$RX_BG_TEXTURE      = "(?i)\bnoise\b|\bgrain\b|\btexture\b|bg-\[url|background-image|backdrop-blur|blur-\d+|mix-blend|opacity-\d+|mask-image|\bfilter:\s*|\bbackdrop-filter\b"

# Fonts
$RX_NEXT_FONT       = "(?i)\bnext\/font\/(google|local)\b"
$RX_FONT_FAMILY     = "(?i)\bfont-family\s*:"
$RX_FONT_VAR        = "(?i)--font-[A-Za-z0-9_-]+"
$RX_HTML_BODY       = "(?i)<html\b|<body\b|\bclassName\s*=\s*{[^}]*\b(font|variable)\b"

# Package deps (hints)
$RX_PKG_THEME_DEPS  = "(?i)`"tailwindcss`"|`"next-themes`"|`"shadcn`"|`"@radix-ui`"|`"class-variance-authority`"|`"tailwind-merge`"|`"clsx`"|`"lucide-react`"|`"@tailwindcss\/typography`"|`"@tailwindcss\/forms`""

# Long dash characters (en dash / em dash)
$RX_LONG_DASH       = "[\u2013\u2014]"

# Pills / segmented controls heuristic signals
$RX_PILL_HELPER_USE = "(?i)\bpillClass\s*\(|\bpillGroupClass\s*\(|\bpillIconClass\s*\("
$RX_TAB_SIGNALS     = "(?i)\baria-selected\b|\brole\s*=\s*[`"`']tab[`"`']|\bdata-state\s*=\s*[`"`']active[`"`']|\bTabs\b|\btablist\b|\bsegmented\b"

# Auth and form nesting hazards (root cause of GET /signin?email=...&password=...)
$RX_FORM_TAG        = "(?i)<form\b"
$RX_CHILDREN_SLOT   = "(?i)\{\s*children\s*\}"
$RX_METHOD_GET      = "(?i)\bmethod\s*=\s*[`"`']get[`"`']"
$RX_CALLBACK_ROUTE  = "(?i)\/api\/auth\/callback\/credentials\b"
$RX_EMAIL_FIELD     = "(?i)\bname\s*=\s*[`"`']email[`"`']"
$RX_PASSWORD_FIELD  = "(?i)\bname\s*=\s*[`"`']password[`"`']"
$RX_SIGNIN_ROUTE    = "(?i)\/signin(\?|$)"

# Dark scope extraction blocks (for var assignment diff)
$RX_DARK_BLOCKS     = "(?is)(\.dark\b[^{]*\{([\s\S]*?)\}|html\s*\[data-theme\s*=\s*[`"`']dark[`"`']\][^{]*\{([\s\S]*?)\}|:root\s*\[data-theme\s*=\s*[`"`']dark[`"`']\][^{]*\{([\s\S]*?)\})"

# ----------------------------- Output buffer -----------------------------
$Lines = New-Object System.Collections.Generic.List[string]
function Add-Line([string]$s) { [void]$Lines.Add($s) }
function Add-Header([string]$t) { Add-Line ""; Add-Line ("=" * 96); Add-Line $t; Add-Line ("=" * 96) }
function Add-Sub([string]$t) { Add-Line ""; Add-Line ("=" * 72); Add-Line $t; Add-Line ("=" * 72) }

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

  $hitsArr = ConvertTo-Array $hits
  if ($hitsArr.Count -eq 0) { Add-Line "  (no hits)"; return 0 }

  $i = 0
  foreach ($h in $hitsArr) {
    $i++
    if ($i -gt $MaxHits) { Add-Line ("  (truncated; {0}+ hits)" -f $hitsArr.Count); break }

    $lineNo = "?"
    if ($null -ne $h -and $h.PSObject.Properties.Match("LineNumber").Count -gt 0) { $lineNo = $h.LineNumber }

    $lineTxt = ""
    if ($null -ne $h -and $h.PSObject.Properties.Match("Line").Count -gt 0) { $lineTxt = (ConvertTo-TrimmedLine $h.Line) }

    Add-Line ("  [Line {0}] {1}" -f $lineNo, $lineTxt)

    $pre = @()
    $post = @()

    if ($null -ne $h -and $h.PSObject.Properties.Match("Context").Count -gt 0 -and $null -ne $h.Context) {
      $ctx = $h.Context
      if ($ctx.PSObject.Properties.Match("PreContext").Count -gt 0 -and $null -ne $ctx.PreContext) { $pre = ConvertTo-Array $ctx.PreContext }
      if ($ctx.PSObject.Properties.Match("PostContext").Count -gt 0 -and $null -ne $ctx.PostContext) { $post = ConvertTo-Array $ctx.PostContext }
    }

    foreach ($pl in (ConvertTo-Array $pre)) { if ($pl) { Add-Line ("        (pre)  {0}" -f (ConvertTo-TrimmedLine $pl)) } }
    foreach ($pl in (ConvertTo-Array $post)) { if ($pl) { Add-Line ("        (post) {0}" -f (ConvertTo-TrimmedLine $pl)) } }
  }

  return $hitsArr.Count
}

function Find-FilesWithPattern {
  param(
    [string[]]$Paths,
    [string]$Pattern
  )
  $pathsArr = ConvertTo-Array $Paths
  if ($pathsArr.Count -eq 0) { return @() }

  $out = @()
  try {
    $hits = Select-String -LiteralPath $pathsArr -Pattern $Pattern -AllMatches -ErrorAction SilentlyContinue
    if ($hits) { $out = @($hits | Select-Object -ExpandProperty Path -Unique) }
  } catch { $out = @() }

  return @($out | Sort-Object -Unique)
}

function Get-MatchCountInFile {
  param([string]$Path, [string]$Pattern)
  $raw = Get-FileText $Path
  if ($null -eq $raw) { return 0 }
  return ([regex]::Matches($raw, $Pattern)).Count
}

function Get-CssVarNamesFromText([string]$raw) {
  $names = New-Object System.Collections.Generic.List[string]
  if ($null -eq $raw) { return $names }

  $ms = [regex]::Matches($raw, $RX_CSS_VAR_DEF)
  foreach ($m in $ms) {
    $name = ($m.Value -replace '\s*:.*$','').Trim()
    if ($name) { [void]$names.Add($name) }
  }
  return $names
}

function Get-CssVars {
  param([string[]]$CssFiles)

  $vars = New-Object System.Collections.Generic.List[string]
  foreach ($p in (ConvertTo-Array $CssFiles)) {
    $raw = Get-FileText $p
    if ($null -eq $raw) { continue }
    $ms = Get-CssVarNamesFromText $raw
    foreach ($n in $ms) { [void]$vars.Add($n) }
  }
  return $vars
}

function Get-CssVarAssignmentsByScope {
  <#
    Extracts CSS variable assignments within :root and within dark scopes.
    Heuristic (regex-based).
  #>
  param([string[]]$CssFiles)

  $rootMap = @{}
  $darkMap = @{}

  foreach ($p in (ConvertTo-Array $CssFiles)) {
    $raw = Get-FileText $p
    if ($null -eq $raw) { continue }

    $rootBlocks = [regex]::Matches($raw, "(?is):root\s*\{([\s\S]*?)\}")
    foreach ($b in $rootBlocks) {
      $body = $b.Groups[1].Value
      $assigns = [regex]::Matches($body, "(?im)(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);")
      foreach ($a in $assigns) {
        $k = $a.Groups[1].Value.Trim()
        $v = $a.Groups[2].Value.Trim()
        if ($k) { $rootMap[$k] = $v }
      }
    }

    $darkBlocks = [regex]::Matches($raw, $RX_DARK_BLOCKS)
    foreach ($b in $darkBlocks) {
      $body = ""
      for ($gi=2; $gi -le 4; $gi++) {
        if ($b.Groups[$gi].Success -and $b.Groups[$gi].Value) { $body = $b.Groups[$gi].Value; break }
      }
      if (-not $body) { continue }

      $assigns = [regex]::Matches($body, "(?im)(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);")
      foreach ($a in $assigns) {
        $k = $a.Groups[1].Value.Trim()
        $v = $a.Groups[2].Value.Trim()
        if ($k) { $darkMap[$k] = $v }
      }
    }
  }

  return @{ Root = $rootMap; Dark = $darkMap }
}

function Write-FileList {
  param([string]$Title, [string[]]$Files, [string]$RepoRoot)

  Add-Sub $Title
  $arr = ConvertTo-Array $Files
  if ($arr.Count -eq 0) { Add-Line "  (none)"; return }

  $i = 0
  foreach ($p in $arr) {
    $i++
    if ($i -gt $MaxFileList) { Add-Line ("  (truncated; {0}+ files)" -f $arr.Count); break }
    Add-Line ("  {0}" -f (ConvertTo-RelativePath $p $RepoRoot))
  }
}

function Write-OffendersWithLines {
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

  $pathsArr = ConvertTo-Array $Paths
  if ($pathsArr.Count -eq 0) { Add-Line "  (no files)"; return }

  $linesOut = 0
  try {
    $hits = Select-String -LiteralPath $pathsArr -Pattern $Pattern -AllMatches -Context $Before,$After -ErrorAction SilentlyContinue |
      Sort-Object Path, LineNumber
  } catch {
    Add-Line "  (scan failed)"
    return
  }

  if (-not $hits) { Add-Line "  (no hits)"; return }

  foreach ($h in $hits) {
    $linesOut++
    if ($linesOut -gt $MaxLines) { Add-Line "  (truncated; more hits exist)"; break }
    Add-Line ("  {0}:{1}  {2}" -f (ConvertTo-RelativePath $h.Path $RepoRoot), $h.LineNumber, (ConvertTo-TrimmedLine $h.Line))
  }
}

function Get-TopOffendersByCount {
  param(
    [string]$Label,
    [string[]]$Paths,
    [string]$Pattern,
    [int]$TopN,
    [string]$RepoRoot
  )

  $rows = New-Object System.Collections.Generic.List[object]
  foreach ($p in (ConvertTo-Array $Paths)) {
    $c = Get-MatchCountInFile -Path $p -Pattern $Pattern
    if ($c -gt 0) { [void]$rows.Add([pscustomobject]@{ Path = $p; Count = $c }) }
  }

  Add-Sub $Label
  if ($rows.Count -eq 0) { Add-Line "  (none)"; return }

  # FIXED: stable sort syntax (avoids parse errors)
  $sorted = $rows | Sort-Object @{Expression='Count';Descending=$true}, @{Expression='Path';Descending=$false}

  $i = 0
  foreach ($r in $sorted) {
    $i++
    if ($i -gt $TopN) { break }
    Add-Line ("  {0}  ({1})" -f (ConvertTo-RelativePath $r.Path $RepoRoot), $r.Count)
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

$configFiles = @()
$configFiles += @(Get-ChildItem -File -ErrorAction SilentlyContinue -Path $repoRoot -Filter "tailwind.config.*" | Select-Object -ExpandProperty FullName)
$configFiles += @(Get-ChildItem -File -ErrorAction SilentlyContinue -Path $repoRoot -Filter "postcss.config.*"   | Select-Object -ExpandProperty FullName)
$configFiles += @(Get-ChildItem -File -ErrorAction SilentlyContinue -Path $repoRoot -Filter "next.config.*"     | Select-Object -ExpandProperty FullName)
$configFiles += @(Get-ChildItem -File -ErrorAction SilentlyContinue -Path $repoRoot -Filter "package.json"      | Select-Object -ExpandProperty FullName)
$configFiles = @($configFiles | Sort-Object -Unique)

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

$globalsFiles = @()
try {
  foreach ($base in @("src","app","styles")) {
    $p = Join-Path $repoRoot $base
    if (-not (Test-Path -LiteralPath $p)) { continue }
    $globalsFiles += @(Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue -Path $p |
      Where-Object { $_.Name -match "(?i)globals\.css$|global\.css$|app\.css$" } |
      Select-Object -ExpandProperty FullName)
  }
} catch { $globalsFiles = @() }
$globalsFiles = @($globalsFiles | Sort-Object -Unique)

$outDirFull = Resolve-OutDir -RepoRoot $repoRoot -OutDirValue $OutDir
New-Item -ItemType Directory -Force $outDirFull | Out-Null
$fullOut = Join-Path $outDirFull $OutFile

# ----------------------------- Report header -----------------------------
Add-Header "QwikSale scan report: UI theme inventory + token compliance + auth/sign-in hazards"
Add-Line ("Generated: {0}" -f (Get-Date))
Add-Line ("Repo:      {0}" -f $repoRoot)
Add-Line ("Code:      {0} files" -f (ConvertTo-Array $codeFiles).Count)
Add-Line ("CSS:       {0} files" -f (ConvertTo-Array $cssFiles).Count)
Add-Line ("MD:        {0} files" -f (ConvertTo-Array $mdFiles).Count)
Add-Line ("Configs:   {0} files" -f (ConvertTo-Array $configFiles).Count)
Add-Line ("Out:       {0}" -f $fullOut)

# ----------------------------- 0) Key config locations -----------------------------
Add-Header "0) Key files (where the design system usually lives)"
Write-FileList -Title "Tailwind / PostCSS / Next / package.json found" -Files $configFiles -RepoRoot $repoRoot
Write-FileList -Title "Likely global CSS file(s)" -Files $globalsFiles -RepoRoot $repoRoot
Write-FileList -Title "Likely layout file(s) (where fonts/theme providers attach)" -Files $layoutFiles -RepoRoot $repoRoot

# ----------------------------- 1) Dark mode + theme mechanism -----------------------------
Add-Header "1) Dark mode + theme mechanism"
$twFiles = @($configFiles | Where-Object { $_ -match "(?i)tailwind\.config\." })

Add-Sub "A) Tailwind darkMode setting (tailwind.config.*)"
if ((ConvertTo-Array $twFiles).Count -eq 0) {
  Add-Line "  (no tailwind config detected)"
} else {
  foreach ($cfg in $twFiles) {
    Add-Line ""
    Add-Line ("FILE: {0}" -f (ConvertTo-RelativePath $cfg $repoRoot))
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_DARKMODE -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After $ContextAfter)
  }
}

Add-Sub "B) Theme provider signals (next-themes and similar)"
$themeFiles = @(Find-FilesWithPattern -Paths $codeFiles -Pattern $RX_NEXT_THEMES)
Write-FileList -Title "Files with theme provider signals" -Files $themeFiles -RepoRoot $repoRoot

Add-Sub "C) Direct dark class toggling"
$darkToggleFiles = @(Find-FilesWithPattern -Paths $codeFiles -Pattern $RX_DARK_CLASSLIST)
Write-FileList -Title "Files toggling 'dark' class directly" -Files $darkToggleFiles -RepoRoot $repoRoot

Add-Sub "D) data-theme usage"
$dataThemeFiles = @(Find-FilesWithPattern -Paths ($codeFiles + $cssFiles) -Pattern $RX_DATA_THEME)
Write-FileList -Title "Files referencing data-theme" -Files $dataThemeFiles -RepoRoot $repoRoot

Add-Sub "E) prefers-color-scheme usage"
$prefFiles = @(Find-FilesWithPattern -Paths ($codeFiles + $cssFiles) -Pattern $RX_PREFERS_COLORSCHEME)
Write-FileList -Title "Files referencing prefers-color-scheme" -Files $prefFiles -RepoRoot $repoRoot

# ----------------------------- 2) CSS variables & base layers -----------------------------
Add-Header "2) CSS tokens (variables) and light/dark diffs"
$rootCss = @(Find-FilesWithPattern -Paths $cssFiles -Pattern $RX_CSS_ROOT)
$darkCss = @(Find-FilesWithPattern -Paths $cssFiles -Pattern $RX_CSS_DARK_SCOPE)

Add-Sub "A) Files containing :root scopes"
Write-FileList -Title ":root files" -Files $rootCss -RepoRoot $repoRoot

Add-Sub "B) Files containing dark scopes (.dark or data-theme)"
Write-FileList -Title "dark scope files" -Files $darkCss -RepoRoot $repoRoot

Add-Sub "C) CSS variable inventory"
$vars = Get-CssVars -CssFiles $cssFiles
if ((ConvertTo-Array $vars).Count -eq 0) {
  Add-Line "  (no CSS variables found)"
} else {
  $uniq = $vars | Group-Object | Sort-Object Count -Descending
  Add-Line ("  Total var defs: {0}" -f (ConvertTo-Array $vars).Count)
  Add-Line ("  Unique vars:    {0}" -f (ConvertTo-Array $uniq).Count)
  Add-Line ""
  Add-Line "  Top variables by frequency (up to 60):"
  $i = 0
  foreach ($g in $uniq) {
    $i++
    if ($i -gt 60) { break }
    Add-Line ("    {0}  ({1})" -f $g.Name, $g.Count)
  }
}

Add-Sub "D) :root vs dark variable assignment diff (best-effort)"
$maps = Get-CssVarAssignmentsByScope -CssFiles $cssFiles
$rootMap = $maps.Root
$darkMap = $maps.Dark

Add-Line ("  root assignments: {0}" -f (ConvertTo-Array $rootMap.Keys).Count)
Add-Line ("  dark assignments: {0}" -f (ConvertTo-Array $darkMap.Keys).Count)

if ((ConvertTo-Array $rootMap.Keys).Count -gt 0 -or (ConvertTo-Array $darkMap.Keys).Count -gt 0) {
  $allKeys = @($rootMap.Keys + $darkMap.Keys | Sort-Object -Unique)
  $changed = New-Object System.Collections.Generic.List[string]

  foreach ($k in $allKeys) {
    $hasR = $rootMap.ContainsKey($k)
    $hasD = $darkMap.ContainsKey($k)
    if ($hasR -and $hasD -and ($rootMap[$k] -ne $darkMap[$k])) { [void]$changed.Add($k) }
  }

  Add-Line ""
  Add-Line ("  Vars changed between light and dark: {0}" -f (ConvertTo-Array $changed).Count)
  $i = 0
  foreach ($k in $changed) {
    $i++; if ($i -gt 80) { Add-Line "    (truncated)"; break }
    Add-Line ("    {0} : root='{1}'  dark='{2}'" -f $k, $rootMap[$k], $darkMap[$k])
  }
} else {
  Add-Line "  (no variable assignment blocks detected)"
}

Add-Sub "E) @layer and @apply usage"
$layerFiles = @(Find-FilesWithPattern -Paths $cssFiles -Pattern $RX_CSS_LAYER)
$applyFiles = @(Find-FilesWithPattern -Paths $cssFiles -Pattern $RX_CSS_APPLY)
Write-FileList -Title "@layer files" -Files $layerFiles -RepoRoot $repoRoot
Write-FileList -Title "@apply files" -Files $applyFiles -RepoRoot $repoRoot

# ----------------------------- 3) Tailwind theme tokens -----------------------------
Add-Header "3) Tailwind theme tokens (colors, fonts, shadows, radius, spacing)"
if ((ConvertTo-Array $twFiles).Count -eq 0) {
  Add-Line "  (no tailwind config detected)"
} else {
  foreach ($cfg in $twFiles) {
    Add-Line ""
    Add-Line ("FILE: {0}" -f (ConvertTo-RelativePath $cfg $repoRoot))
    Add-Line "  colors/extend:"
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_COLORS -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After 16)
    Add-Line "  fontFamily:"
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_FONTFAMILY -MaxHits 12 -Before $ContextBefore -After 12)
    Add-Line "  boxShadow:"
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_BOXSHADOW -MaxHits 12 -Before $ContextBefore -After 12)
    Add-Line "  borderRadius:"
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_BORDERRADIUS -MaxHits 12 -Before $ContextBefore -After 12)
    Add-Line "  spacing:"
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_SPACING -MaxHits 12 -Before $ContextBefore -After 12)
    Add-Line "  content globs:"
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_CONTENT -MaxHits 12 -Before $ContextBefore -After 12)
    Add-Line "  plugins:"
    [void](Add-ContextHits -Path $cfg -Pattern $RX_TW_PLUGINS -MaxHits 18 -Before $ContextBefore -After 18)
  }
}

# ----------------------------- 4) Color usage: tokens vs hardcoded -----------------------------
Add-Header "4) Color usage: tokens vs hardcoded"
Write-FileList -Title "A) Brand token usage (brand*) files" -Files (Find-FilesWithPattern -Paths ($codeFiles + $cssFiles) -Pattern $RX_BRAND_TOKENS) -RepoRoot $repoRoot

Add-Sub "B) Hardcoded hex usage sample hits"
try {
  $hexHits = Select-String -LiteralPath ($codeFiles + $cssFiles) -Pattern $RX_HEX -AllMatches -ErrorAction SilentlyContinue |
    Sort-Object Path, LineNumber

  if (-not $hexHits) {
    Add-Line "  (no hex colors found)"
  } else {
    $i = 0
    foreach ($h in $hexHits) {
      $i++
      if ($i -gt $MaxHexHits) { Add-Line ("  (truncated; {0}+ hits)" -f (ConvertTo-Array $hexHits).Count); break }
      Add-Line ("  {0}:{1}  {2}" -f (ConvertTo-RelativePath $h.Path $repoRoot), $h.LineNumber, (ConvertTo-TrimmedLine $h.Line))
    }
  }
} catch {
  Add-Line "  (scan failed)"
}

Write-FileList -Title "C) Tailwind arbitrary colors offenders" -Files (Find-FilesWithPattern -Paths $codeFiles -Pattern $RX_TW_ARBITRARY_COLOR) -RepoRoot $repoRoot

# ----------------------------- 5) UI primitives map -----------------------------
Add-Header "5) UI primitives map (where to change the look safely)"
Write-FileList -Title "A) Where primitives are used (card/btn/input/etc)" -Files (Find-FilesWithPattern -Paths $codeFiles -Pattern $RX_PRIMITIVES) -RepoRoot $repoRoot
$primDefs = @(Find-FilesWithPattern -Paths $cssFiles -Pattern $RX_PRIMITIVE_DEFS)
Write-FileList -Title "B) Where primitives are defined (CSS selectors)" -Files $primDefs -RepoRoot $repoRoot

# ----------------------------- 6) Fonts -----------------------------
Add-Header "6) Fonts"
Write-FileList -Title "A) next/font usage" -Files (Find-FilesWithPattern -Paths $codeFiles -Pattern $RX_NEXT_FONT) -RepoRoot $repoRoot
Write-FileList -Title "B) font-family declarations in CSS" -Files (Find-FilesWithPattern -Paths $cssFiles -Pattern $RX_FONT_FAMILY) -RepoRoot $repoRoot
Write-FileList -Title "C) font variables (--font-*)" -Files (Find-FilesWithPattern -Paths ($codeFiles + $cssFiles) -Pattern $RX_FONT_VAR) -RepoRoot $repoRoot

Add-Sub "D) Layout wiring snippets"
foreach ($p in (ConvertTo-Array $layoutFiles)) {
  Add-Line ""
  Add-Line ("FILE: {0}" -f (ConvertTo-RelativePath $p $repoRoot))
  [void](Add-ContextHits -Path $p -Pattern $RX_NEXT_FONT -MaxHits 10 -Before $ContextBefore -After $ContextAfter)
  [void](Add-ContextHits -Path $p -Pattern $RX_HTML_BODY -MaxHits 10 -Before $ContextBefore -After $ContextAfter)
  [void](Add-ContextHits -Path $p -Pattern $RX_FONT_VAR -MaxHits 10 -Before $ContextBefore -After $ContextAfter)
}

# ----------------------------- 7) Background and texture signals -----------------------------
Add-Header "7) Background and texture signals"
Write-FileList -Title "A) Gradient usage files" -Files (Find-FilesWithPattern -Paths ($codeFiles + $cssFiles) -Pattern $RX_GRADIENTS) -RepoRoot $repoRoot
Write-FileList -Title "B) Texture/noise/overlay usage files" -Files (Find-FilesWithPattern -Paths ($codeFiles + $cssFiles) -Pattern $RX_BG_TEXTURE) -RepoRoot $repoRoot

# ----------------------------- 8) Package hints -----------------------------
Add-Header "8) Package hints"
$pkg = Join-Path $repoRoot "package.json"
if (Test-Path -LiteralPath $pkg) {
  Add-Line ("FILE: {0}" -f (ConvertTo-RelativePath $pkg $repoRoot))
  [void](Add-ContextHits -Path $pkg -Pattern $RX_PKG_THEME_DEPS -MaxHits 70 -Before 0 -After 0)
} else {
  Add-Line "  (package.json not found in repo root)"
}

# ----------------------------- 9) Token compliance scans -----------------------------
Add-Header "9) Token compliance scans"
Get-TopOffendersByCount -Label "A) Top offenders: legacy palette utility classes" -Paths $codeFiles -Pattern $RX_LEGACY_PALETTE -TopN $MaxTopOffenders -RepoRoot $repoRoot
Write-OffendersWithLines -Title "A1) Sample legacy palette hits" -Paths $codeFiles -Pattern $RX_LEGACY_PALETTE -MaxLines $MaxOffenderLines -Before 0 -After 0 -RepoRoot $repoRoot

Get-TopOffendersByCount -Label "B) Top offenders: Tailwind arbitrary colors" -Paths $codeFiles -Pattern $RX_TW_ARBITRARY_COLOR -TopN $MaxTopOffenders -RepoRoot $repoRoot
Write-OffendersWithLines -Title "B1) Sample arbitrary color hits" -Paths $codeFiles -Pattern $RX_TW_ARBITRARY_COLOR -MaxLines $MaxOffenderLines -Before 0 -After 0 -RepoRoot $repoRoot

Get-TopOffendersByCount -Label "C) Top offenders: raw hex literals" -Paths ($codeFiles + $cssFiles) -Pattern $RX_HEX -TopN $MaxTopOffenders -RepoRoot $repoRoot

Add-Sub "D) Non-approved gradient lines (heuristic)"
try {
  $gradHits = Select-String -LiteralPath $codeFiles -Pattern $RX_GRADIENTS -AllMatches -ErrorAction SilentlyContinue |
    Sort-Object Path, LineNumber

  if (-not $gradHits) {
    Add-Line "  (no gradients found)"
  } else {
    $i = 0
    foreach ($h in $gradHits) {
      $line = (ConvertTo-TrimmedLine $h.Line)
      $isApproved = [regex]::IsMatch($line, $RX_APPROVED_BRAND_GRADIENT)
      if ($isApproved) { continue }
      $i++
      if ($i -gt $MaxOffenderLines) { Add-Line "  (truncated)"; break }
      Add-Line ("  {0}:{1}  {2}" -f (ConvertTo-RelativePath $h.Path $repoRoot), $h.LineNumber, $line)
    }
    if ($i -eq 0) { Add-Line "  (only approved brand gradient found in sampled lines)" }
  }
} catch {
  Add-Line "  (scan failed)"
}

Get-TopOffendersByCount -Label "E) Top offenders: long dash characters (en dash/em dash)" -Paths ($codeFiles + $mdFiles) -Pattern $RX_LONG_DASH -TopN $MaxTopOffenders -RepoRoot $repoRoot
Write-OffendersWithLines -Title "E1) Sample long dash hits" -Paths ($codeFiles + $mdFiles) -Pattern $RX_LONG_DASH -MaxLines $MaxOffenderLines -Before 0 -After 0 -RepoRoot $repoRoot

Add-Sub "F) Possible segmented controls without pill helpers (heuristic)"
try {
  $tabFiles = @(Find-FilesWithPattern -Paths $codeFiles -Pattern $RX_TAB_SIGNALS)
  if ((ConvertTo-Array $tabFiles).Count -eq 0) {
    Add-Line "  (no tab/segmented signals found)"
  } else {
    $missing = @()
    foreach ($p in $tabFiles) {
      if (Get-MatchCountInFile -Path $p -Pattern $RX_PILL_HELPER_USE -eq 0) { $missing += $p }
    }

    if ((ConvertTo-Array $missing).Count -eq 0) {
      Add-Line "  (all tab-signal files also reference pill helpers)"
    } else {
      Add-Line "  Files with tab/segmented signals but no pill helpers:"
      foreach ($p in ($missing | Sort-Object -Unique | Select-Object -First $MaxFileList)) {
        Add-Line ("  - {0}" -f (ConvertTo-RelativePath $p $repoRoot))
      }
    }
  }
} catch {
  Add-Line "  (scan failed)"
}

# ----------------------------- 10) Auth and sign-in hazards -----------------------------
Add-Header "10) Auth and sign-in hazards (likely root cause when specs keep landing back on /signin)"
Add-Line "Context:"
Add-Line "  If a layout or wrapper renders a <form> around {children}, the /signin inner form becomes invalid HTML."
Add-Line "  Browsers then submit the outer form (often GET to /signin), causing URLs like /signin?email=...&password=..."
Add-Line "  This matches Playwright failures where login never leaves /signin."

Add-Sub "A) Layout files that contain a <form> tag"
$layoutForms = @(Find-FilesWithPattern -Paths $layoutFiles -Pattern $RX_FORM_TAG)
Write-FileList -Title "Layouts containing <form>" -Files $layoutForms -RepoRoot $repoRoot

Add-Sub "B) High-risk layouts: <form> and {children} both present"
$highRiskLayouts = @()
foreach ($p in (ConvertTo-Array $layoutFiles)) {
  $raw = Get-FileText $p
  if ($null -eq $raw) { continue }
  $hasForm = [regex]::IsMatch($raw, $RX_FORM_TAG)
  $hasChildren = [regex]::IsMatch($raw, $RX_CHILDREN_SLOT)
  if ($hasForm -and $hasChildren) { $highRiskLayouts += $p }
}
Write-FileList -Title "High-risk layouts (<form> wraps {children})" -Files ($highRiskLayouts | Sort-Object -Unique) -RepoRoot $repoRoot

Add-Sub "C) Context snippets for high-risk layouts"
foreach ($p in ($highRiskLayouts | Sort-Object -Unique)) {
  Add-Line ""
  Add-Line ("FILE: {0}" -f (ConvertTo-RelativePath $p $repoRoot))
  [void](Add-ContextHits -Path $p -Pattern $RX_FORM_TAG -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After $ContextAfter)
  [void](Add-ContextHits -Path $p -Pattern $RX_CHILDREN_SLOT -MaxHits 8 -Before $ContextBefore -After $ContextAfter)
  [void](Add-ContextHits -Path $p -Pattern $RX_METHOD_GET -MaxHits 8 -Before $ContextBefore -After $ContextAfter)
}

Add-Sub "D) Files that use method='get' in forms"
$formsGetFiles = @(Find-FilesWithPattern -Paths $codeFiles -Pattern $RX_METHOD_GET)
Write-FileList -Title "Files with method='get' forms" -Files $formsGetFiles -RepoRoot $repoRoot
Write-OffendersWithLines -Title "GET form sample lines" -Paths $formsGetFiles -Pattern $RX_METHOD_GET -MaxLines 140 -Before 0 -After 0 -RepoRoot $repoRoot

Add-Sub "E) Files referencing the credentials callback route"
$cbFiles = @(Find-FilesWithPattern -Paths $codeFiles -Pattern $RX_CALLBACK_ROUTE)
Write-FileList -Title "Files referencing /api/auth/callback/credentials" -Files $cbFiles -RepoRoot $repoRoot

Add-Sub "F) Files containing name='email' or name='password'"
$maybeAuthForms = @(Find-FilesWithPattern -Paths $codeFiles -Pattern $RX_EMAIL_FIELD)
$maybeAuthForms = @($maybeAuthForms + (Find-FilesWithPattern -Paths $codeFiles -Pattern $RX_PASSWORD_FIELD) | Sort-Object -Unique)
Write-FileList -Title "Files containing email/password form field names" -Files $maybeAuthForms -RepoRoot $repoRoot

Add-Sub "G) Files referencing /signin"
$signinRefFiles = @(Find-FilesWithPattern -Paths $codeFiles -Pattern $RX_SIGNIN_ROUTE)
Write-FileList -Title "Files referencing /signin" -Files $signinRefFiles -RepoRoot $repoRoot

# ----------------------------- 11) Summary -----------------------------
Add-Header "11) Summary (what to look at first)"

$darkModeGuess = "unknown"
foreach ($cfg in $twFiles) {
  $raw = Get-FileText $cfg
  if ($null -eq $raw) { continue }
  $m = [regex]::Match($raw, $RX_TW_DARKMODE)
  if ($m.Success) { $darkModeGuess = $m.Groups[1].Value.ToLowerInvariant(); break }
}

$hasNextThemes = ((ConvertTo-Array $themeFiles).Count -gt 0)
$hasCssVars    = ((ConvertTo-Array $vars).Count -gt 0)

$hexCount = 0
$legacyCount = 0
$arbitraryCount = 0
foreach ($p in (ConvertTo-Array $codeFiles)) {
  $hexCount += Get-MatchCountInFile -Path $p -Pattern $RX_HEX
  $legacyCount += Get-MatchCountInFile -Path $p -Pattern $RX_LEGACY_PALETTE
  $arbitraryCount += Get-MatchCountInFile -Path $p -Pattern $RX_TW_ARBITRARY_COLOR
}

Add-Line ("Tailwind darkMode:                 {0}" -f $darkModeGuess)
Add-Line ("next-themes signals:              {0}" -f (Get-YesNo $hasNextThemes))
Add-Line ("CSS variables present:            {0}" -f (Get-YesNo $hasCssVars))
Add-Line ("Approx hardcoded hex uses (code): {0}" -f $hexCount)
Add-Line ("Approx legacy palette uses:       {0}" -f $legacyCount)
Add-Line ("Approx arbitrary color uses:      {0}" -f $arbitraryCount)
Add-Line ("High-risk layouts for sign-in:    {0}" -f (ConvertTo-Array $highRiskLayouts).Count)

Add-Line ""
Add-Line "Priority order:"
Add-Line "  1) Any layout that has <form> and {children} together. Remove the wrapper form."
Add-Line "  2) Any method='get' form that can wrap whole pages."
Add-Line "  3) Confirm /signin inner form still posts to the credentials callback."

Add-Line ""
Add-Line "Next step:"
Add-Line "  Run this script, then paste the FULL report text back into chat."
Add-Line "  I will name the exact file(s) causing the nesting and give full file replacements."

Add-Header "DONE"
Add-Line ("Report written: {0}" -f $fullOut)

Set-Content -LiteralPath $fullOut -Value $Lines -Encoding UTF8 -Force
Write-Host ("Report written: {0}" -f $fullOut)
