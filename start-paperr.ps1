# start-paperr.ps1 — Build + run paperr for the local network.
# Drives production via the process environment; dotenv won't override these,
# so .env can stay on NODE_ENV=development for normal dev work.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$env:NODE_ENV = 'production'

# 1. Build the React client (skip with -NoBuild if dist/ is already current)
if (-not ($args -contains '-NoBuild')) {
    Write-Host "`n[paperr] Building client..." -ForegroundColor Cyan
    Push-Location "$root\client"
    npm run build
    Pop-Location
}

# 2. Show the LAN address devices should use
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' } |
    Select-Object -First 1).IPAddress
$port = if ($env:PORT) { $env:PORT } else { '3000' }

Write-Host "`n[paperr] Starting server (production)..." -ForegroundColor Green
Write-Host "  This device : http://localhost:$port"
if ($ip) { Write-Host "  On network  : http://${ip}:$port" -ForegroundColor Yellow }
Write-Host ""

# 3. Run the server (foreground; Ctrl+C to stop)
Push-Location "$root\server"
node index.js
Pop-Location
