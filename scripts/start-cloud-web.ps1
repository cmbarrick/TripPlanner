# Launches the Expo web client against the DEPLOYED cloud API with real Entra sign-in.
# Unlike start-local.ps1, this does NOT set the dev-bypass user, so you get the real
# "Sign in" flow. All values below are non-secret (public SPA client id / issuer / audience).

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $root "app"

# Make sure the dev-bypass header is OFF for this session.
Remove-Item Env:EXPO_PUBLIC_DEV_USER_ID -ErrorAction SilentlyContinue

$env:EXPO_PUBLIC_API_URL    = "https://app-wander-dev-azgnto.azurewebsites.net"
$env:EXPO_PUBLIC_AUTH_ISSUER = "https://wandertripapp.ciamlogin.com/wandertripapp.onmicrosoft.com/v2.0"
$env:EXPO_PUBLIC_AUTH_CLIENT_ID = "b32700ac-b867-4a6a-a245-ceafc3c9de74"
$env:EXPO_PUBLIC_AUTH_AUDIENCE = "b32700ac-b867-4a6a-a245-ceafc3c9de74"

Write-Host "Starting Wander web (cloud API + Entra sign-in)..." -ForegroundColor Cyan
Write-Host "API:    $($env:EXPO_PUBLIC_API_URL)" -ForegroundColor DarkGray
Write-Host "Issuer: $($env:EXPO_PUBLIC_AUTH_ISSUER)" -ForegroundColor DarkGray
Write-Host "Note: CORS on the API allows localhost:8081/8082/19006. If Metro picks another port, add it." -ForegroundColor Yellow

Set-Location $appDir
npx expo start --web --clear
