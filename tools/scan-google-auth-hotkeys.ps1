param(
  [string]$OutDir = "tools/_reports",
  [string]$OutFile = ("scan-google-auth-hotkeys-{0}.txt" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ----------------------------- Patterns -----------------------------
# Hotkeys / keyboard bugs
$RX_KEY_TOLOWER   = '(?i)\bkey\s*\.\s*toLowerCase\s*\('
$RX_EKEY_TOLOWER  = '(?i)\be\.key\s*\.\s*toLowerCase\s*\('
$RX_ADD_KEYDOWN   = '(?i)addEventListener\s*\(\s*["''](keydown|keyup|keypress)["'']'
$RX_ONKEYDOWN     = '(?i)\bonKeyDown\b|\bonKeyUp\b|\bonKeyPress\b'
$RX_KEY_GUARD     = '(?i)typeof\s+e\.key\s*===\s*["'']string["'']|e\.key\s*\?\.' # shows defensive code

# Auth / Google / NextAuth wiring
$RX_SIGNIN_GOOGLE   = '(?i)\bsignIn\s*\(\s*["'']google["'']'
$RX_GOOGLE_PROVIDER = '(?i)\bGoogleProvider\b'
$RX_NEXTAUTH        = '(?i)\bNextAuth\b|\bauthOptions\b|\bAuthOptions\b|\bcallbacks\s*:\s*\{'
$RX_API_AUTH_ROUTE  = '(?i)\\api\\auth\\|/api/auth/|next-auth'
$RX_CALLBACKURL     = '(?i)\bcallbackUrl\b|\bredirect_uri\b|\bredirectUri\b|\bcallback\b.*google'
$RX_OAUTH_ERROR_UI  = '(?i)Access blocked|request is invalid|invalid_request|redirect_uri_mismatch'

# Env var usage (common culprits)
$RX_ENV_AUTH = '(?i)\b(NEXTAUTH_URL|NEXTAUTH_SECRET|AUTH_URL|AUTH_SECRET|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|NEXT_PUBLIC_BASE_URL|NEXT_PUBLIC_APP_URL)\b'

# Signin / signup files
$RX_SIGNIN_SIGNUP = '(?i)\\signin\\|\\signup\\|/signin|/signup'

# ----------------------------- Output helpers -----------------------------
$Lines = New-Object System.Collections.Generic.List[string]
function Add-Line([string]$s) { [void]$Lines.Add($s) }
function Add-Header([string]$t) { Add-Line ""; Add-Line ("=" * 110); Add-Line $t; Add-Line ("=" * 110) }
function Add-Sub([string]$t) { Add-Line ""; Add-Line ("-" * 110); Add-Line $t; Add-Line ("-" * 110) }

function Add-ContextHits {
  param(
    [string]$Path,
    [string]$Pattern,
    [int]$MaxHits = 20,
    [int]$Before = 2,
    [int]$After = 3
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
    foreach ($pl in $h.Context.PreContext)  { if ($pl) { Add-Line ("        (pre)  {0}" -f $pl.TrimEnd()) } }
    foreach ($pl in $h.Context.PostContext) { if ($pl) { Add-Line ("        (post) {0}" -f $pl.TrimEnd()) } }
  }
  return $hits.Count
}

# ----------------------------- Collect files -----------------------------
$repoRoot = (Get-Location).Path
$codeFiles = @(Get-ChildItem -Path "src","tests" -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension -in ".ts",".tsx",".js",".jsx" } |
  Select-Object -ExpandProperty FullName)

New-Item -ItemType Directory -Force $OutDir | Out-Null
$fullOut = Join-Path (Join-Path $repoRoot $OutDir) $OutFile

Add-Header "QwikSale scan: Google auth + signin/signup + header hotkeys"
Add-Line ("Generated: {0}" -f (Get-Date))
Add-Line ("Repo:      {0}" -f $repoRoot)
Add-Line ("Files:     {0}" -f $codeFiles.Count)
Add-Line ("Out:       {0}" -f $fullOut)

# ----------------------------- 1) Hotkey crash sources -----------------------------
Add-Header "1) Hotkey crash suspects (e.key.toLowerCase / key.toLowerCase / keydown listeners)"
Add-Sub "A) Direct e.key.toLowerCase() (HIGH RISK)"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_EKEY_TOLOWER -AllMatches -ErrorAction SilentlyContinue
  if (-not $hits) { Add-Line "  (none found)" } else { foreach ($h in $hits) { Add-Line ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) } }
} catch { Add-Line "  (scan failed)" }

Add-Sub "B) Any key.toLowerCase() usage (review for guards)"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_KEY_TOLOWER -AllMatches -ErrorAction SilentlyContinue
  if (-not $hits) { Add-Line "  (none found)" } else { foreach ($h in $hits) { Add-Line ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) } }
} catch { Add-Line "  (scan failed)" }

Add-Sub "C) Where keydown/keyup/keypress listeners are attached"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_ADD_KEYDOWN -AllMatches -ErrorAction SilentlyContinue
  if (-not $hits) { Add-Line "  (none found)" } else { foreach ($h in $hits) { Add-Line ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) } }
} catch { Add-Line "  (scan failed)" }

Add-Sub "D) Defensive guards already present (sanity)"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_KEY_GUARD -AllMatches -ErrorAction SilentlyContinue
  if (-not $hits) { Add-Line "  (none found)" } else { foreach ($h in $hits) { Add-Line ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) } }
} catch { Add-Line "  (scan failed)" }

# ----------------------------- 2) Signin/Signup wiring -----------------------------
Add-Header "2) Signin/Signup route + UI files"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_SIGNIN_SIGNUP -AllMatches -ErrorAction SilentlyContinue
  $paths = @($hits | Select-Object -ExpandProperty Path -Unique | Sort-Object)
  if (-not $paths -or $paths.Count -eq 0) { Add-Line "  (none found)" }
  else { foreach ($p in $paths) { Add-Line ("  {0}" -f $p) } }
} catch { Add-Line "  (scan failed)" }

# ----------------------------- 3) Google auth wiring -----------------------------
Add-Header "3) Google auth wiring (signIn('google'), GoogleProvider, NextAuth, /api/auth)"
Add-Sub "A) signIn('google') calls"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_SIGNIN_GOOGLE -AllMatches -ErrorAction SilentlyContinue
  if (-not $hits) { Add-Line "  (none found)" } else { foreach ($h in $hits) { Add-Line ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) } }
} catch { Add-Line "  (scan failed)" }

Add-Sub "B) GoogleProvider usage"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_GOOGLE_PROVIDER -AllMatches -ErrorAction SilentlyContinue
  if (-not $hits) { Add-Line "  (none found)" } else { foreach ($h in $hits) { Add-Line ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) } }
} catch { Add-Line "  (scan failed)" }

Add-Sub "C) NextAuth/authOptions/callbacks usage"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_NEXTAUTH -AllMatches -ErrorAction SilentlyContinue
  if (-not $hits) { Add-Line "  (none found)" } else { foreach ($h in $hits) { Add-Line ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) } }
} catch { Add-Line "  (scan failed)" }

Add-Sub "D) /api/auth route references"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_API_AUTH_ROUTE -AllMatches -ErrorAction SilentlyContinue
  if (-not $hits) { Add-Line "  (none found)" } else { foreach ($h in $hits) { Add-Line ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) } }
} catch { Add-Line "  (scan failed)" }

Add-Sub "E) callbackUrl/redirectUri/callback references"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_CALLBACKURL -AllMatches -ErrorAction SilentlyContinue
  if (-not $hits) { Add-Line "  (none found)" } else { foreach ($h in $hits) { Add-Line ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) } }
} catch { Add-Line "  (scan failed)" }

# ----------------------------- 4) Env var usage -----------------------------
Add-Header "4) Env var usage (NEXTAUTH_URL, GOOGLE_CLIENT_ID, etc.)"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_ENV_AUTH -AllMatches -ErrorAction SilentlyContinue
  if (-not $hits) { Add-Line "  (none found) <-- would be odd; check env loading approach" }
  else { foreach ($h in $hits) { Add-Line ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) } }
} catch { Add-Line "  (scan failed)" }

# ----------------------------- 5) Any UI strings for the OAuth error -----------------------------
Add-Header "5) OAuth error string usage (if you render/transform it)"
try {
  $hits = Select-String -Path $codeFiles -Pattern $RX_OAUTH_ERROR_UI -AllMatches -ErrorAction SilentlyContinue
  if (-not $hits) { Add-Line "  (none found)" }
  else { foreach ($h in $hits) { Add-Line ("  {0}:{1}  {2}" -f $h.Path, $h.LineNumber, $h.Line.TrimEnd()) } }
} catch { Add-Line "  (scan failed)" }

Add-Header "DONE"
Add-Line ("Report written: {0}" -f $fullOut)

Set-Content -LiteralPath $fullOut -Value $Lines -Encoding UTF8 -Force
Write-Host ("Report written: {0}" -f $fullOut)
