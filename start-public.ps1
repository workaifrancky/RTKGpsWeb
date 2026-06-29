$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$httpServer = Join-Path $root 'serve-http.cjs'
$localPort = 8000

if (-not (Get-NetTCPConnection -LocalPort $localPort -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath 'node.exe' -ArgumentList @($httpServer) -WorkingDirectory $root -WindowStyle Hidden | Out-Null
  Start-Sleep -Milliseconds 500
}

Write-Host 'Tunnel public en cours...'
Write-Host "Le site local doit répondre sur http://127.0.0.1:$localPort"
Write-Host 'URL souhaitée: https://rtkgpsweb.loca.lt'

npx --yes localtunnel --port $localPort --local-host 127.0.0.1 --subdomain rtkgpsweb