# scripts/audit-signin.ps1
[CmdletBinding()]
param(
  [string]$Root = "src/app",           # or "src/app/components"
  [string]$OutFile = "",               # e.g. ".\audit-signin-report.txt"
  [switch]$FailOnMismatch              # exit 1 if any mismatches are found
)

$ErrorActionPreference = "Stop"

# Case-sensitive exact phrase we want everywhere:
$ReExact        = '(?<![A-Za-z])Sign in(?![A-Za-z])'

# Things to flag as mismatches:
$ReAnySignIn    = '(?i)\bSign[ -]?in\b'         # any case, hyphen or space
$ReDoubleSpace  = '(?<![A-Za-z])Sign\p{Zs}{2,}in(?![A-Za-z])'  # double+ space

function Find-Matches {
  param(
    [string]$Path,
    [string]$Pattern,
    [switch]$CaseSensitive
  )
  $params = @{ Path = $Path; Pattern = $Pattern }
  if ($CaseSensitive) { $params['CaseSensitive'] = $true }
  Select-String @params | ForEach-Object {
    [PSCustomObject]@{
      Path       = $_.Path
      LineNumber = $_.LineNumber
      Line       = $_.Line.Trim()
    }
  }
}

# Collect files
$files = Get-ChildItem -Path "$Root/*" -Recurse -Include *.ts,*.tsx -File

$exactHits = @()
$badHits   = @()

foreach ($f in $files) {
  $exact = Find-Matches -Path $f.FullName -Pattern $ReExact -CaseSensitive
  if ($exact) { $exactHits += $exact }

  # Any sign-in-ish string
  $any = Find-Matches -Path $f.FullName -Pattern $ReAnySignIn
  foreach ($hit in $any) {
    if ($hit.Line -notmatch $ReExact) { $badHits += $hit }
  }

  # Double-space specifically
  $dbl = Find-Matches -Path $f.FullName -Pattern $ReDoubleSpace
  foreach ($hit in $dbl) {
    if ($badHits -notcontains $hit) { $badHits += $hit }
  }
}

$report = New-Object System.Collections.Generic.List[object]

$header = @"
Audit: 'Sign in' usage
- Enforce exact, case-sensitive phrase: Sign in
- Flag mismatches: "Sign In", "Sign-in", "SignIn", multiple spaces
Root: $Root
"@
$report.Add($header)

$report.Add("---- EXACT occurrences (OK) ----")
if ($exactHits.Count -eq 0) {
  $report.Add("  (none)")
} else {
  $exactHits | Sort-Object Path, LineNumber | ForEach-Object {
    $report.Add("  $($_.Path):$($_.LineNumber)  $($_.Line)")
  }
}

$report.Add("`n---- MISMATCHES (FIX THESE) ----")
if ($badHits.Count -eq 0) {
  $report.Add("  (none)")
} else {
  $badHits | Sort-Object Path, LineNumber | ForEach-Object {
    $report.Add("  $($_.Path):$($_.LineNumber)  $($_.Line)")
  }
}

# Output
$reportStr = ($report -join [Environment]::NewLine)
Write-Host $reportStr

if ($OutFile) {
  $reportStr | Out-File -FilePath $OutFile -Encoding UTF8
  Write-Host "`nSaved report => $OutFile"
}

if ($FailOnMismatch -and $badHits.Count -gt 0) {
  exit 1
}
