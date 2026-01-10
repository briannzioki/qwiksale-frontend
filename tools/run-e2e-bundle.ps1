# tools/run-e2e-bundle.ps1
# Runs the selected Playwright specs in a single command, saves:
# 1) raw output (everything)
# 2) reduced summary (failing tests + top error + repo file/line hits)

[CmdletBinding()]
param(
  [string]$Project = "chromium",
  [int]$Workers = 1,
  [int]$Retries = 0,
  [ValidateSet("on", "off", "retain-on-failure")] [string]$Trace = "on"
)

Set-StrictMode -Version Latest

function New-LogDir {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $dir = Join-Path -Path "test-logs" -ChildPath $stamp
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  return $dir
}

function Normalize-RepoPath {
  param([string]$Path, [string]$RepoRoot)

  if (-not $Path) { return $Path }
  $p = $Path

  # Strip surrounding parentheses that sometimes appear in stack frames
  $p = $p.Trim()
  $p = $p.TrimStart("(").TrimEnd(")")

  # Normalize slashes
  $p = $p -replace "/", "\"

  # Make relative to repo if possible
  if ($RepoRoot -and $p.StartsWith($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    $p = $p.Substring($RepoRoot.Length).TrimStart("\")
  }

  return $p
}

function Parse-PlaywrightLog {
  param(
    [string]$RawLogPath,
    [string]$SummaryPath
  )

  $repoRoot = (Resolve-Path ".").Path
  $lines = Get-Content -LiteralPath $RawLogPath -ErrorAction Stop

  # Playwright can print failures in a few formats depending on reporter/version.
  # We'll detect blocks by headers like:
  #   1) [chromium] › tests/e2e/foo.spec.ts:12:3 › Title...
  # or:
  #   ✘  1 [chromium] › tests/e2e/foo.spec.ts:12:3 › Title...
  $headerRx = [regex]'^\s*(?:✘|×)?\s*\d+\)?\s*(?:\[[^\]]+\]\s*)?(?:›|>)\s*(?<spec>tests[\\/].+?\.spec\.ts)(?::(?<line>\d+):(?<col>\d+))?\s*(?:›|>)\s*(?<title>.+?)\s*$'
  $specLooseRx = [regex]'(?<spec>tests[\\/].+?\.spec\.ts)(?::(?<line>\d+):(?<col>\d+))?'
  $frameRx = [regex]'(?<path>(?:[A-Za-z]:\\|\\)?[^():]+?\.(?:ts|tsx|js|jsx)):(?<line>\d+):(?<col>\d+)'
  $failSummaryRx = [regex]'(?i)\b(?<n>\d+)\s+failed\b'
  $passSummaryRx = [regex]'(?i)\b(?<n>\d+)\s+passed\b'
  $skipSummaryRx = [regex]'(?i)\b(?<n>\d+)\s+skipped\b'
  $flakySummaryRx = [regex]'(?i)\b(?<n>\d+)\s+flaky\b'

  $failures = New-Object System.Collections.Generic.List[object]
  $current = $null

  function Flush-Current {
    if ($null -ne $current) {
      $failures.Add($current) | Out-Null
      $script:current = $null
    }
  }

  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]

    $m = $headerRx.Match($line)
    if ($m.Success) {
      Flush-Current
      $current = [pscustomobject]@{
        Spec       = ($m.Groups["spec"].Value)
        Title      = ($m.Groups["title"].Value.Trim())
        Error      = $null
        Details    = New-Object System.Collections.Generic.List[string]
        RepoFrames = New-Object System.Collections.Generic.List[string]
        Artifacts  = New-Object System.Collections.Generic.List[string]
      }
      continue
    }

    # Some reporters don’t include the leading › header; try a looser detection:
    if ($null -eq $current) {
      if ($line -match '^\s*\d+\)\s') {
        $sm = $specLooseRx.Match($line)
        if ($sm.Success -and $line -match '(?:›|>)') {
          # Best effort: split on › and use the remainder as title
          $parts = $line -split '›'
          $specPart = $sm.Groups["spec"].Value
          $titlePart = ($parts | Select-Object -Last 1).Trim()
          if ($specPart -and $titlePart) {
            $current = [pscustomobject]@{
              Spec       = $specPart
              Title      = $titlePart
              Error      = $null
              Details    = New-Object System.Collections.Generic.List[string]
              RepoFrames = New-Object System.Collections.Generic.List[string]
              Artifacts  = New-Object System.Collections.Generic.List[string]
            }
            continue
          }
        }
      }
    }

    if ($null -eq $current) { continue }

    # Capture first meaningful error line
    if (-not $current.Error) {
      if ($line -match '^\s*Error:\s*(.+)$') {
        $current.Error = $Matches[1].Trim()
      } elseif ($line -match '(?i)\b(timeout \d+ms exceeded|navigation timeout|strict mode violation|net::|ERR_|expect\(|Target page, context or browser has been closed)\b') {
        $current.Error = $line.Trim()
      }
    }

    # Capture useful expectation / call log lines (keep it short)
    if ($current.Details.Count -lt 14) {
      if ($line -match '^\s*(Expected:|Received:|Call log:|Locator:|waiting for|Timed out|expect\(|page\.)') {
        $current.Details.Add($line.Trim()) | Out-Null
      }
    }

    # Capture artifacts (trace/screenshot/video paths)
    if ($line -match '(?i)\b(trace\.zip|screenshot|video|attachment)\b') {
      $t = $line.Trim()
      if (-not [string]::IsNullOrWhiteSpace($t) -and -not $current.Artifacts.Contains($t)) {
        $current.Artifacts.Add($t) | Out-Null
      }
    }

    # Capture stack frames, but prefer repo frames (exclude node_modules/playwright internals)
    $fm = $frameRx.Match($line)
    if ($fm.Success) {
      $p = $fm.Groups["path"].Value
      if ($p -and ($p -notmatch '(?i)node_modules|playwright|@playwright|internal')) {
        $norm = Normalize-RepoPath -Path ($p + ":" + $fm.Groups["line"].Value + ":" + $fm.Groups["col"].Value) -RepoRoot $repoRoot
        if (-not $current.RepoFrames.Contains($norm)) {
          $current.RepoFrames.Add($norm) | Out-Null
        }
      }
    }
  }

  Flush-Current

  # Pull overall counts from the tail
  $rawText = $lines -join "`n"
  $failedN = ($failSummaryRx.Match($rawText).Groups["n"].Value)
  $passedN = ($passSummaryRx.Match($rawText).Groups["n"].Value)
  $skippedN = ($skipSummaryRx.Match($rawText).Groups["n"].Value)
  $flakyN = ($flakySummaryRx.Match($rawText).Groups["n"].Value)

  # Aggregate repo files hit
  $allFiles = New-Object System.Collections.Generic.HashSet[string]
  foreach ($f in $failures) {
    foreach ($rf in $f.RepoFrames) {
      # Keep only the path portion up to extension, but preserve :line:col for jump-to
      if ($rf) { $allFiles.Add($rf) | Out-Null }
    }
  }

  # Write summary
  $out = New-Object System.Collections.Generic.List[string]
  $out.Add("Playwright reduced failure summary") | Out-Null
  $out.Add("Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')") | Out-Null
  $out.Add("") | Out-Null

  if ($failedN) { $out.Add("Counts: $failedN failed" + ($(if ($passedN) { ", $passedN passed" } else { "" })) + ($(if ($skippedN) { ", $skippedN skipped" } else { "" })) + ($(if ($flakyN) { ", $flakyN flaky" } else { "" }))) | Out-Null }
  $out.Add("Fail blocks found: $($failures.Count)") | Out-Null
  $out.Add("") | Out-Null

  if ($failures.Count -eq 0) {
    $out.Add("No failures detected in the log parser. If tests still failed, switch reporter to 'list' by changing --reporter=line to --reporter=list in this script for richer formatting.") | Out-Null
  } else {
    $idx = 1
    foreach ($f in $failures) {
      $out.Add("[$idx] $($f.Spec)") | Out-Null
      $out.Add("    Test: $($f.Title)") | Out-Null
      if ($f.Error) {
        $out.Add("    Error: $($f.Error)") | Out-Null
      } else {
        $out.Add("    Error: (not captured; see raw log)") | Out-Null
      }

      if ($f.Details.Count -gt 0) {
        $out.Add("    Details:") | Out-Null
        foreach ($d in $f.Details) { $out.Add("      - $d") | Out-Null }
      }

      if ($f.RepoFrames.Count -gt 0) {
        $out.Add("    Repo stack hits:") | Out-Null
        foreach ($rf in ($f.RepoFrames | Select-Object -First 8)) {
          $out.Add("      - $rf") | Out-Null
        }
      }

      if ($f.Artifacts.Count -gt 0) {
        $out.Add("    Artifacts:") | Out-Null
        foreach ($a in ($f.Artifacts | Select-Object -First 6)) { $out.Add("      - $a") | Out-Null }
      }

      $out.Add("") | Out-Null
      $idx++
    }

    $out.Add("Repo files to inspect (unique hits):") | Out-Null
    foreach ($x in ($allFiles | Sort-Object)) { $out.Add("  - $x") | Out-Null }
  }

  $out | Set-Content -LiteralPath $SummaryPath -Encoding UTF8
}

# Specs you listed
$specs = @(
  "tests/e2e/admin-carriers-enforcement.spec.ts",
  "tests/e2e/carrier-onboarding.spec.ts",
  "tests/e2e/delivery-header-entry.spec.ts",
  "tests/e2e/delivery-product-entry.spec.ts",
  "tests/e2e/header-requests-drawer.spec.ts",
  "tests/e2e/requests.spec.ts",
  "tests/e2e/smoke-prod.spec.ts"
)

$logDir = New-LogDir
$rawLog = Join-Path $logDir "playwright-raw.txt"
$summaryLog = Join-Path $logDir "playwright-summary.txt"

# Single combined run (reduced noise reporter)
$args = @("exec","playwright","test") + $specs + @(
  "--project=$Project",
  "--workers=$Workers",
  "--retries=$Retries",
  "--trace=$Trace",
  "--reporter=line"
)

# Write command header into raw log
"Command: pnpm $($args -join ' ')" | Set-Content -LiteralPath $rawLog -Encoding UTF8
"Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Add-Content -LiteralPath $rawLog

# Run and capture output (do NOT stop the script on non-zero exit)
$ErrorActionPreference = "Continue"
& pnpm @args 2>&1 | Tee-Object -FilePath $rawLog -Append | Out-Host
$exitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"

"ExitCode: $exitCode" | Add-Content -LiteralPath $rawLog

Parse-PlaywrightLog -RawLogPath $rawLog -SummaryPath $summaryLog

Write-Host ""
Write-Host "Raw log:     $rawLog"
Write-Host "Reduced log: $summaryLog"
Write-Host "ExitCode:    $exitCode"

exit $exitCode
