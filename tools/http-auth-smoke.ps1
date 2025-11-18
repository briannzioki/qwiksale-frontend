# tools/http-auth-smoke.ps1
$ErrorActionPreference = 'SilentlyContinue'
function Hit($url) {
  try {
    $r = Invoke-WebRequest $url -UseBasicParsing -Headers @{Accept='application/json'} -TimeoutSec 8
    "$url  ->  $($r.StatusCode)`n$($r.Content)`n"
  } catch {
    "$url  ->  ERROR $($_.Exception.Message)`n"
  }
}
Hit "http://localhost:3000/api/auth/csrf"
Hit "http://localhost:3000/api/auth/session"
