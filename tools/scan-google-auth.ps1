<#
  scan-google-auth.ps1
  --------------------
  Targeted scanner for "Google sign-in server error on live" and "signin fails but signup works".

  It maps:
    - NextAuth configuration locations and Google provider wiring
    - Where UI triggers Google sign-in (signIn("google") / /api/auth/signin/google)
    - Differences between /signin and /signup pages
    - Env vars referenced in code vs env vars defined in .env* files
    - Middleware/domain enforcement signals that could break /api/auth on live
    - Optional LIVE probe to confirm status codes for /api/auth endpoints

  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\scan-google-auth.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\scan-google-auth.ps1 -OutDir tools/_reports

  Optional LIVE probe:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\scan-google-auth.ps1 -ProbeLive -BaseUrl "https://your-domain"
#>

param(
  [string]$OutDir = 'tools/_reports',
  [string]$OutFile = ('scan-google-auth-{0}.txt' -f (Get-Date -Format 'yyyyMMdd-HHmmss')),

  [int]$MaxFileList = 250,
  [int]$MaxContextHitsPerFile = 24,
  [int]$ContextBefore = 2,
  [int]$ContextAfter = 8,

  [switch]$ProbeLive,
  [string]$BaseUrl = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ----------------------------- Utilities -----------------------------
function To-Arr($x) {
  if ($null -eq $x) { Write-Output -NoEnumerate @(); return }
  Write-Output -NoEnumerate @($x)
}

function TrimLine([string]$s) {
  if ($null -eq $s) { '' } else { $s.TrimEnd() }
}

function Add-Line([System.Collections.Generic.List[string]]$Lines, [string]$s) {
  [void]$Lines.Add($s)
}

function Add-Header([System.Collections.Generic.List[string]]$Lines, [string]$t) {
  Add-Line $Lines ''
  Add-Line $Lines ('=' * 110)
  Add-Line $Lines $t
  Add-Line $Lines ('=' * 110)
}

function Add-Sub([System.Collections.Generic.List[string]]$Lines, [string]$t) {
  Add-Line $Lines ''
  Add-Line $Lines ('-' * 110)
  Add-Line $Lines $t
  Add-Line $Lines ('-' * 110)
}

function Safe-ReadRaw([string]$Path) {
  try { return Get-Content -LiteralPath $Path -Raw -ErrorAction Stop } catch { return $null }
}

function Add-ContextHits {
  param(
    [System.Collections.Generic.List[string]]$Lines,
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
  if ($hitsArr.Count -eq 0) { Add-Line $Lines '  (no hits)'; return 0 }

  $i = 0
  foreach ($h in $hitsArr) {
    $i++
    if ($i -gt $MaxHits) { Add-Line $Lines ('  (truncated; {0}+ hits)' -f $hitsArr.Count); break }

    $lineNo = '?'
    if ($null -ne $h -and $h.PSObject.Properties.Match('LineNumber').Count -gt 0) { $lineNo = $h.LineNumber }

    $lineTxt = ''
    if ($null -ne $h -and $h.PSObject.Properties.Match('Line').Count -gt 0) { $lineTxt = (TrimLine $h.Line) }

    Add-Line $Lines ('  [Line {0}] {1}' -f $lineNo, $lineTxt)

    $pre = @()
    $post = @()

    if ($null -ne $h -and $h.PSObject.Properties.Match('Context').Count -gt 0 -and $null -ne $h.Context) {
      $ctx = $h.Context
      if ($ctx.PSObject.Properties.Match('PreContext').Count -gt 0 -and $null -ne $ctx.PreContext) { $pre = To-Arr $ctx.PreContext }
      if ($ctx.PSObject.Properties.Match('PostContext').Count -gt 0 -and $null -ne $ctx.PostContext) { $post = To-Arr $ctx.PostContext }
    }

    foreach ($pl in (To-Arr $pre)) { if ($pl) { Add-Line $Lines ('        (pre)  {0}' -f (TrimLine $pl)) } }
    foreach ($pl in (To-Arr $post)) { if ($pl) { Add-Line $Lines ('        (post) {0}' -f (TrimLine $pl)) } }
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

function Emit-FileList {
  param(
    [System.Collections.Generic.List[string]]$Lines,
    [string]$Title,
    [string[]]$Files,
    [int]$Max = 200
  )
  Add-Sub $Lines $Title
  $arr = To-Arr $Files
  if ($arr.Count -eq 0) { Add-Line $Lines '  (none)'; return }
  $i = 0
  foreach ($p in $arr) {
    $i++
    if ($i -gt $Max) { Add-Line $Lines ('  (truncated; {0}+ files)' -f $arr.Count); break }
    Add-Line $Lines ('  {0}' -f $p)
  }
}

function Get-EnvKeysFromFile([string]$Path) {
  $keys = New-Object System.Collections.Generic.HashSet[string]
  $raw = Safe-ReadRaw $Path
  if ($null -eq $raw) { return $keys }
  $lines = $raw -split "`r?`n"
  foreach ($ln in $lines) {
    if ($ln -match '^\s*#') { continue }
    if ($ln -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
      [void]$keys.Add($Matches[1])
    }
  }
  return $keys
}

function Get-EnvKeysReferencedInCode([string[]]$Files) {
  $keys = New-Object System.Collections.Generic.HashSet[string]
  foreach ($p in (To-Arr $Files)) {
    $raw = Safe-ReadRaw $p
    if ($null -eq $raw) { continue }
    $ms = [regex]::Matches($raw, '(?m)\bprocess\.env\.([A-Za-z_][A-Za-z0-9_]*)\b')
    foreach ($m in $ms) {
      $k = $m.Groups[1].Value
      if ($k) { [void]$keys.Add($k) }
    }
  }
  return $keys
}

function Probe-Url([string]$Url) {
  $result = [ordered]@{
    url = $Url
    status = ''
    location = ''
    error = ''
  }

  try {
    $resp = Invoke-WebRequest -Uri $Url -Method GET -MaximumRedirection 0 -UseBasicParsing
    $result.status = [string]$resp.StatusCode
    if ($resp.Headers['Location']) { $result.location = [string]$resp.Headers['Location'] }
  } catch {
    $ex = $_.Exception
    $result.error = ($ex.Message | Out-String).Trim()
    try {
      if ($ex.Response -and $ex.Response.StatusCode) {
        $result.status = [string]$ex.Response.StatusCode.value__
        try {
          $loc = $ex.Response.Headers['Location']
          if ($loc) { $result.location = [string]$loc }
        } catch {}
      }
    } catch {}
  }

  return $result
}

# ----------------------------- Patterns (targeted) -----------------------------
$RX_NEXTAUTH_IMPORTS   = '(?i)\bnext-auth\b|\bNextAuth\b|\bNextAuthOptions\b|\bAuthOptions\b'
$RX_GOOGLE_PROVIDER    = '(?i)\bGoogleProvider\b'
$RX_SIGNIN_GOOGLE_CALL = '(?i)\bsignIn\s*\(\s*["'']google["'']'
$RX_SIGNIN_ANY_CALL    = '(?i)\bsignIn\s*\('
$RX_SIGNIN_GOOGLE_URL  = '(?i)\/api\/auth\/signin\/google\b'
$RX_API_AUTH_PATH      = '(?i)\/api\/auth\b'
$RX_CALLBACKURL        = '(?i)\bcallbackUrl\b'
$RX_REDIRECT_CALLBACK  = '(?i)\bcallbacks\s*:\s*\{[\s\S]*?\bredirect\s*\('
$RX_TRUST_HOST         = '(?i)\btrustHost\b|\bAUTH_TRUST_HOST\b|\bNEXTAUTH_URL\b|\bNEXTAUTH_SECRET\b'
$RX_DOMAIN_ENFORCE     = '(?i)\bPRIMARY_DOMAIN\b|\bPRIMARY_DOMAIN_ENFORCE\b|\bx-forwarded-host\b|\bX_FORWARDED_HOST\b|\bhost\b'
$RX_AUTH_PAGES_TEXT    = '(?i)\/signin\b|\/signup\b|\/register\b|create account|sign up|sign in'

# ----------------------------- Collect files (exclude junk) -----------------------------
$repoRoot = (Resolve-Path '.').Path

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
    Where-Object { $_.Extension -in '.ts','.tsx','.js','.jsx','.mjs','.cjs' } |
    Select-Object -ExpandProperty FullName
)

# Includes .env, .env.local, .env.e2e.local, etc
$envFiles = @(
  $all |
    Where-Object { $_.Name -match '^(?:\.env(?:\..+)?)$' } |
    Select-Object -ExpandProperty FullName
)

New-Item -ItemType Directory -Force $OutDir | Out-Null
$fullOut = Join-Path (Join-Path $repoRoot $OutDir) $OutFile

$Lines = New-Object System.Collections.Generic.List[string]

Add-Header $Lines 'QwikSale scan: Google Sign-In / NextAuth wiring (targeted)'
Add-Line $Lines ('Generated: {0}' -f (Get-Date))
Add-Line $Lines ('Repo:      {0}' -f $repoRoot)
Add-Line $Lines ('Code files: {0}' -f (To-Arr $codeFiles).Count)
Add-Line $Lines ('Env files:  {0}' -f (To-Arr $envFiles).Count)
Add-Line $Lines ('Out:       {0}' -f $fullOut)

# ----------------------------- 1) NextAuth + provider wiring -----------------------------
Add-Header $Lines '1) NextAuth presence: route handlers + options + providers'

$nextAuthFiles = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_NEXTAUTH_IMPORTS)
Emit-FileList $Lines 'A) Files that reference next-auth / NextAuth' $nextAuthFiles $MaxFileList

$googleProviderFiles = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_GOOGLE_PROVIDER)
Emit-FileList $Lines 'B) Files with GoogleProvider signals' $googleProviderFiles $MaxFileList

foreach ($p in (To-Arr $googleProviderFiles)) {
  Add-Line $Lines ''
  Add-Line $Lines ('FILE: {0}' -f $p)
  [void](Add-ContextHits -Lines $Lines -Path $p -Pattern $RX_GOOGLE_PROVIDER -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After $ContextAfter)
  [void](Add-ContextHits -Lines $Lines -Path $p -Pattern $RX_TRUST_HOST -MaxHits 12 -Before $ContextBefore -After $ContextAfter)
  [void](Add-ContextHits -Lines $Lines -Path $p -Pattern $RX_REDIRECT_CALLBACK -MaxHits 12 -Before $ContextBefore -After $ContextAfter)
}

# ----------------------------- 2) UI triggers -----------------------------
Add-Header $Lines '2) UI triggers: signIn("google") vs /api/auth/signin/google links (signin vs signup differences)'

$signinCallFiles = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_SIGNIN_ANY_CALL)
Emit-FileList $Lines 'A) Files calling signIn(...)' $signinCallFiles $MaxFileList

$googleSignInCallFiles = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_SIGNIN_GOOGLE_CALL)
Emit-FileList $Lines 'B) Files calling signIn("google", ...)' $googleSignInCallFiles $MaxFileList

foreach ($p in (To-Arr $googleSignInCallFiles)) {
  Add-Line $Lines ''
  Add-Line $Lines ('FILE: {0}' -f $p)
  [void](Add-ContextHits -Lines $Lines -Path $p -Pattern $RX_SIGNIN_GOOGLE_CALL -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After $ContextAfter)
  [void](Add-ContextHits -Lines $Lines -Path $p -Pattern $RX_CALLBACKURL -MaxHits 12 -Before $ContextBefore -After $ContextAfter)
}

$googleUrlFiles = @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_SIGNIN_GOOGLE_URL)
Emit-FileList $Lines 'C) Files linking directly to /api/auth/signin/google' $googleUrlFiles $MaxFileList

foreach ($p in (To-Arr $googleUrlFiles)) {
  Add-Line $Lines ''
  Add-Line $Lines ('FILE: {0}' -f $p)
  [void](Add-ContextHits -Lines $Lines -Path $p -Pattern $RX_SIGNIN_GOOGLE_URL -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After $ContextAfter)
}

# Heuristic: auth pages by path + text
$authPageFiles = @()
$authPageFiles += @(List-FilesWithPattern -Paths $codeFiles -Pattern $RX_AUTH_PAGES_TEXT)
$authPageFiles += @($codeFiles | Where-Object { $_ -match '(?i)\\app\\(signin|signup|register)\\page\.tsx$' })
$authPageFiles = @($authPageFiles | Sort-Object -Unique)

Emit-FileList $Lines 'D) Auth-related UI files (signin/signup/register heuristics)' $authPageFiles $MaxFileList

foreach ($p in (To-Arr $authPageFiles)) {
  Add-Line $Lines ''
  Add-Line $Lines ('FILE: {0}' -f $p)
  [void](Add-ContextHits -Lines $Lines -Path $p -Pattern $RX_SIGNIN_GOOGLE_CALL -MaxHits 8 -Before $ContextBefore -After $ContextAfter)
  [void](Add-ContextHits -Lines $Lines -Path $p -Pattern $RX_SIGNIN_GOOGLE_URL -MaxHits 8 -Before $ContextBefore -After $ContextAfter)
  [void](Add-ContextHits -Lines $Lines -Path $p -Pattern $RX_CALLBACKURL -MaxHits 8 -Before $ContextBefore -After $ContextAfter)
}

# ----------------------------- 3) Middleware / domain enforcement -----------------------------
Add-Header $Lines '3) Host / domain enforcement that could break /api/auth on live'

$mw = Join-Path $repoRoot 'middleware.ts'
if (Test-Path -LiteralPath $mw) {
  Add-Line $Lines ('middleware.ts: {0}' -f $mw)
  Add-Line $Lines 'Context hits for host/domain enforcement and api/auth:'
  [void](Add-ContextHits -Lines $Lines -Path $mw -Pattern $RX_DOMAIN_ENFORCE -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After $ContextAfter)
  [void](Add-ContextHits -Lines $Lines -Path $mw -Pattern $RX_API_AUTH_PATH -MaxHits $MaxContextHitsPerFile -Before $ContextBefore -After $ContextAfter)
} else {
  Add-Line $Lines '  (no middleware.ts in repo root)'
}

# ----------------------------- 4) Env var mismatch detection -----------------------------
Add-Header $Lines '4) Env vars: what code references vs what .env files define'

$envKeysReferenced = Get-EnvKeysReferencedInCode -Files $codeFiles
$authRelevant = @(
  $envKeysReferenced |
    Where-Object { $_ -match '(?i)^(NEXTAUTH_|AUTH_|GOOGLE_|OAUTH_|PRIMARY_DOMAIN|PRIMARY_DOMAIN_ENFORCE|VERCEL|NODE_ENV)' }
)
$authRelevant = @($authRelevant | Sort-Object -Unique)

Add-Line $Lines ('Auth-related env keys referenced in code: {0}' -f (To-Arr $authRelevant).Count)
foreach ($k in $authRelevant) { Add-Line $Lines ('  {0}' -f $k) }

Add-Sub $Lines 'A) .env files found'
$envFilesSorted = @($envFiles | Sort-Object -Unique)
if ((To-Arr $envFilesSorted).Count -eq 0) {
  Add-Line $Lines '  (no .env files found)'
} else {
  foreach ($p in $envFilesSorted) { Add-Line $Lines ('  {0}' -f $p) }
}

$definedAll = New-Object System.Collections.Generic.HashSet[string]
foreach ($p in $envFilesSorted) {
  $set = Get-EnvKeysFromFile -Path $p
  foreach ($k in $set) { [void]$definedAll.Add($k) }
}

Add-Sub $Lines 'B) Missing keys (referenced in code but not defined in any .env file)'
$missing = @()
foreach ($k in $authRelevant) {
  if (-not $definedAll.Contains($k)) { $missing += $k }
}
$missing = @($missing | Sort-Object -Unique)

if ((To-Arr $missing).Count -eq 0) {
  Add-Line $Lines '  (none). Local env files define every auth-related key the code references.'
} else {
  Add-Line $Lines '  These are missing from all .env files (they may still be set in your hosting provider):'
  foreach ($k in $missing) { Add-Line $Lines ('  - {0}' -f $k) }
}

Add-Sub $Lines 'C) Google/OAuth env keys referenced in code'
$googleKeys = @($authRelevant | Where-Object { $_ -match '(?i)GOOGLE|OAUTH' } | Sort-Object -Unique)
if ((To-Arr $googleKeys).Count -eq 0) {
  Add-Line $Lines '  (none)'
} else {
  foreach ($k in $googleKeys) { Add-Line $Lines ('  {0}' -f $k) }
}

# ----------------------------- 5) Optional LIVE probe -----------------------------
Add-Header $Lines '5) Optional LIVE probe: /api/auth endpoints'

if (-not $ProbeLive) {
  Add-Line $Lines 'ProbeLive: NO (skipped). Re-run with: -ProbeLive -BaseUrl https://your-domain'
} elseif (-not $BaseUrl) {
  Add-Line $Lines 'ProbeLive: YES but BaseUrl is empty. Provide -BaseUrl https://your-domain'
} else {
  $b = $BaseUrl.TrimEnd('/')
  Add-Line $Lines ('BaseUrl: {0}' -f $b)

  $targets = @(
    "$b/api/auth/providers",
    "$b/api/auth/csrf",
    "$b/api/auth/session",
    "$b/api/auth/signin"
  )

  Add-Line $Lines ''
  Add-Line $Lines 'Results (status + redirect location if any):'
  foreach ($u in $targets) {
    $r = Probe-Url $u
    $loc = if ($r.location) { ('  location={0}' -f $r.location) } else { '' }
    $err = if ($r.error) { ('  error={0}' -f $r.error) } else { '' }
    Add-Line $Lines ('  {0}  status={1}{2}{3}' -f $r.url, $r.status, $loc, $err)
  }

  Add-Line $Lines ''
  Add-Line $Lines 'If providers or signin is HTTP 500 on live, it is almost always env var mismatch, NEXTAUTH_URL, secret, or middleware redirect.'
}

# ----------------------------- 6) What to paste back -----------------------------
Add-Header $Lines '6) Next step'
Add-Line $Lines 'Paste back these report sections:'
Add-Line $Lines '  - Section 2: UI triggers (signin vs signup snippets)'
Add-Line $Lines '  - Section 4: Env var mismatches'
Add-Line $Lines '  - Section 5: Live probe results (if you ran ProbeLive)'

Add-Header $Lines 'DONE'
Add-Line $Lines ('Report written: {0}' -f $fullOut)

Set-Content -LiteralPath $fullOut -Value $Lines -Encoding UTF8 -Force
Write-Host ('Report written: {0}' -f $fullOut)
