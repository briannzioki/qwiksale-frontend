# tools/verify-next15-params-v5.ps1
$ErrorActionPreference = 'Stop'

function RelPath([string]$p) {
  $root = (Get-Location).Path
  $full = (Resolve-Path -LiteralPath $p).Path
  if ($full.StartsWith($root)) { return ".\" + $full.Substring($root.Length).TrimStart("\") }
  return $p
}

function PrintHit([string]$status, [string]$file, [int]$line, [string]$text) {
  $c = "Gray"
  if ($status -eq "PASS") { $c = "Green" }
  elseif ($status -eq "FAIL") { $c = "Red" }
  elseif ($status -eq "WARN") { $c = "Yellow" }

  Write-Host ("[{0}] {1}:{2}" -f $status, (RelPath $file), $line) -ForegroundColor $c
  Write-Host ("    " + ($text.Trim())) -ForegroundColor DarkGray
}

Write-Host "=== Next.js / TS versions ===" -ForegroundColor Cyan
pnpm ls next | Out-Host
pnpm ls typescript | Out-Host

Write-Host "`n=== Scan App Router pages/layouts for params Promise typing ===" -ForegroundColor Cyan
$failCount = 0
$warnCount = 0
$passCount = 0

# Only app router entrypoints we care about for PageProps/LayoutProps typing
$appFiles = Get-ChildItem -Recurse -Path .\src\app -File -Include page.ts,page.tsx,layout.ts,layout.tsx

foreach ($f in $appFiles) {
  $hits = Select-String -LiteralPath $f.FullName -Pattern '^\s*params\s*:\s*' -AllMatches
  if (-not $hits) { continue } # no explicit typing; skip

  foreach ($h in $hits) {
    $lineText = $h.Line

    # Normalize for checks
    $t = $lineText

    # PASS: params: Promise<...>
    if ($t -match 'params\s*:\s*Promise\s*<') {
      # FAIL if union still present, e.g. "{...} | Promise<...>" or "Promise<...> | {...>"
      if ($t -match '\|') {
        PrintHit "FAIL" $f.FullName $h.LineNumber $lineText
        $failCount++
      } else {
        PrintHit "PASS" $f.FullName $h.LineNumber $lineText
        $passCount++
      }
      continue
    }

    # WARN: params: any (works but hides the real typing issue)
    if ($t -match 'params\s*:\s*any\b') {
      PrintHit "WARN" $f.FullName $h.LineNumber $lineText
      $warnCount++
      continue
    }

    # FAIL: any other non-Promise shape (including direct object typing)
    PrintHit "FAIL" $f.FullName $h.LineNumber $lineText
    $failCount++
  }
}

Write-Host "`n=== Scan route handlers for RouteContext params Promise typing ===" -ForegroundColor Cyan
$routeFiles = Get-ChildItem -Recurse -Path .\src\app -File -Include route.ts,route.tsx

foreach ($f in $routeFiles) {
  # Look for RouteCtx alias (your code style), then validate params typing inside it
  $ctxHits = Select-String -LiteralPath $f.FullName -Pattern 'type\s+RouteCtx\s*=\s*\{' -AllMatches
  if (-not $ctxHits) { continue }

  $raw = Get-Content -LiteralPath $f.FullName -Raw

  # Pull a small block after "type RouteCtx = {" for checking
  $m = [regex]::Match($raw, 'type\s+RouteCtx\s*=\s*\{(?s).*?\}', 'Singleline')
  if (-not $m.Success) { continue }

  $block = $m.Value

  # Find the params line inside the block if present
  $pm = [regex]::Match($block, 'params\s*:\s*[^;]+;', 'Singleline')
  if (-not $pm.Success) { continue }

  $lineLike = $pm.Value.Trim()

  if ($lineLike -match 'params\s*:\s*Promise\s*<') {
    if ($lineLike -match '\|') {
      PrintHit "FAIL" $f.FullName 1 $lineLike
      $failCount++
    } else {
      PrintHit "PASS" $f.FullName 1 $lineLike
      $passCount++
    }
  } elseif ($lineLike -match 'params\s*:\s*any\b') {
    PrintHit "WARN" $f.FullName 1 $lineLike
    $warnCount++
  } else {
    PrintHit "FAIL" $f.FullName 1 $lineLike
    $failCount++
  }
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host ("PASS: {0}  WARN: {1}  FAIL: {2}" -f $passCount, $warnCount, $failCount) -ForegroundColor White

if ($failCount -gt 0) {
  Write-Host "`nFAIL: Found non-Promise (or union) params typing. Next 15.5 generated PageProps expects params: Promise<...>." -ForegroundColor Red
  Write-Host "Fix pattern (pages/layouts): ({ params }: { params: Promise<{ id: string }> }) and then: const { id } = await params" -ForegroundColor Yellow
  exit 1
}

Write-Host "`nPASS: No union/non-Promise params typing detected in pages/layouts/route ctx." -ForegroundColor Green
exit 0
