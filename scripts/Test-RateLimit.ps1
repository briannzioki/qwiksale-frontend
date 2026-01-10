<# 
.SYNOPSIS
  Simple rate-limit & cache header tester for your qwiksale API.

.DESCRIPTION
  - Works in Windows PowerShell 5 and PowerShell 7+ (no ternary, explicit try/catch).
  - Includes:
      Add-Nonce        -> appends a random query param to bypass CDN cache
      Get-NoThrow      -> GET that never throws on 4xx/5xx and exposes Retry-After
      Test-RLProbe     -> hammers /api/dev/rl-test (when available)
      Test-Endpoint    -> hammers any GET endpoint and prints only HTTP status codes
      Show-Headers     -> prints key headers for a single request (Retry-After, Cache-Control, etc.)
  - Default domain comes from $env:DOMAIN, or pass -Domain.
#>

param(
  [string]$Domain = $env:DOMAIN,
  [switch]$Help
)

if ($Help -or -not $Domain) {
  Write-Host "Usage:"
  Write-Host "  .\Test-RateLimit.ps1 -Domain https://qwiksale.sale"
  Write-Host ""
  Write-Host "Then call exported functions, e.g.:"
  Write-Host "  Test-RLProbe -Limit 5 -WindowMs 10000 -Times 8"
  Write-Host "  Test-Endpoint -Url ""$Domain/api/products/search?q=test&page=1&pageSize=24"" -Times 60 -BypassCache"
  Write-Host "  Show-Headers -Url ""$Domain/api/products/search?q=test"""
  return
}

Write-Host "Target Domain: $Domain"

function Add-Nonce {
  param([Parameter(Mandatory)][string]$Url)
  if ($Url -match '\?') { return ($Url + '&_t=' + (Get-Random)) }
  else { return ($Url + '?_t=' + (Get-Random)) }
}

function Get-NoThrow {
  <#
    .SYNOPSIS  GET request that never throws; returns Code/Body/RetryAfterSec/Headers.
  #>
  param([Parameter(Mandatory)][string]$Url)

  try {
    $body = Invoke-RestMethod -Method GET -Uri $Url -TimeoutSec 20
    return [pscustomobject]@{
      Code         = 200
      Body         = $body
      RetryAfterSec= $body.retryAfterSec
      Headers      = @{}
    }
  } catch {
    $resp = $_.Exception.Response
    $headers = @{}
    if ($resp -and $resp.Headers) {
      foreach ($k in $resp.Headers.Keys) { $headers[$k] = $resp.Headers[$k] -join "," }
    }
    return [pscustomobject]@{
      Code         = [int]$resp.StatusCode
      Body         = $null
      RetryAfterSec= $headers['Retry-After']
      Headers      = $headers
    }
  }
}

function Test-RLProbe {
  <#
    .SYNOPSIS  Hit /api/dev/rl-test repeatedly to observe 200 -> 429 with Retry-After.
  #>
  param(
    [int]$Limit = 5,
    [int]$WindowMs = 10000,
    [int]$Times = 8
  )
  $url = "$Domain/api/dev/rl-test?name=probe&limit=$Limit&win=$WindowMs"
  for ($i=1; $i -le $Times; $i++) {
    $r = Get-NoThrow $url
    "{0}`tstatus={1}; retryAfterSec={2}" -f $i, $r.Code, $r.RetryAfterSec
    Start-Sleep -Milliseconds 200
  }
}

function Test-Endpoint {
  <#
    .SYNOPSIS  Hammer a GET endpoint and print only status codes (easy to scan).
  #>
  param(
    [Parameter(Mandatory)][string]$Url,
    [int]$Times = 60,
    [switch]$BypassCache
  )
  for ($i=1; $i -le $Times; $i++) {
    $u = $Url
    if ($BypassCache) { $u = Add-Nonce $u }

    try {
      $res = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 20
      $code = $res.StatusCode
    } catch {
      $code = $_.Exception.Response.StatusCode.value__
    }
    Write-Host $code
    Start-Sleep -Milliseconds 150
  }
}

function Show-Headers {
  <#
    .SYNOPSIS  GET once and show Retry-After, Cache-Control and status.
  #>
  param([Parameter(Mandatory)][string]$Url)

  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20
  } catch {
    $r = $_.Exception.Response
  }
  Write-Host "Status: $($r.StatusCode)"
  if ($r.Headers['Retry-After'])      { Write-Host "Retry-After: $($r.Headers['Retry-After'])" }
  if ($r.Headers['Cache-Control'])    { Write-Host "Cache-Control: $($r.Headers['Cache-Control'])" }
  if ($r.Headers['CDN-Cache-Control']){ Write-Host "CDN-Cache-Control: $($r.Headers['CDN-Cache-Control'])" }
  if ($r.Headers['X-Vercel-Id'])      { Write-Host "X-Vercel-Id: $($r.Headers['X-Vercel-Id'])" }
}

Export-ModuleMember -Function Add-Nonce, Get-NoThrow, Test-RLProbe, Test-Endpoint, Show-Headers
