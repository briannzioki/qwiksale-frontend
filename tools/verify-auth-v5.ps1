# tools/verify-auth-v5.ps1
$ErrorActionPreference = 'Stop'

Write-Host "=== next-auth version ===" -ForegroundColor Cyan
pnpm ls next-auth | Out-Host

# Expect v5 in the output:
$ver = (pnpm ls next-auth | Select-String -Pattern 'next-auth\s+').ToString()
if ($ver -notmatch 'next-auth\s+5') {
  Write-Host "FAIL next-auth is not v5; found: $ver" -ForegroundColor Red
} else {
  Write-Host "PASS next-auth v5 detected" -ForegroundColor Green
}

Write-Host "`n=== Check single NextAuth(...) call ===" -ForegroundColor Cyan
$hits = Select-String -Path (Get-ChildItem -Recurse -Include *.ts,*.tsx -Path .\src) -Pattern 'NextAuth\s*\('
$paths = $hits | ForEach-Object { $_.Path } | Select-Object -Unique
if ($paths.Count -ne 1 -or ($paths[0] -notmatch '\\src\\auth\.ts$')) {
  Write-Host "FAIL Expected exactly one NextAuth(...) in src/auth.ts. Found:" -ForegroundColor Red
  $paths | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
} else {
  Write-Host "PASS Single NextAuth(...) invocation in src/auth.ts" -ForegroundColor Green
}

Write-Host "`n=== Ensure no re-export of auth symbol (shadowing) ===" -ForegroundColor Cyan
$rogue = Select-String -Path (Get-ChildItem -Recurse -Include *.ts,*.tsx -Path .\src) -Pattern 'export\s+\{\s*auth\s*\}\s+from'
if ($rogue) {
  Write-Host "FAIL Found potential rogue re-export(s) of auth:" -ForegroundColor Red
  $rogue | ForEach-Object { Write-Host " - $($_.Path):$($_.LineNumber)  $($_.Line.Trim())" -ForegroundColor Yellow }
} else {
  Write-Host "PASS No rogue 'export { auth } from ...' re-exports" -ForegroundColor Green
}

Write-Host "`n=== Allowlisted imports of '@/auth.config' ===" -ForegroundColor Cyan
$ac = Select-String -Path (Get-ChildItem -Recurse -Include *.ts,*.tsx -Path .\src) -Pattern "from\s+['""]@/auth\.config['""]"
$allowed = @('.\src\auth.ts', '.\src\app\api\auth\[...nextauth]\authOptions.ts')
$bad = @()
foreach ($m in $ac) {
  $rel = Resolve-Path -LiteralPath $m.Path | ForEach-Object { $_.Path }
  $rel = $rel.Replace((Get-Location).Path + '\','.\')
  if (-not ($allowed | Where-Object { $rel -ieq $_ })) { $bad += $rel }
}
if ($bad.Count -gt 0) {
  Write-Host "FAIL Unexpected files import '@/auth.config':" -ForegroundColor Red
  $bad | Sort-Object -Unique | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
} else {
  Write-Host "PASS Only src/auth.ts and authOptions.ts import '@/auth.config'" -ForegroundColor Green
}
