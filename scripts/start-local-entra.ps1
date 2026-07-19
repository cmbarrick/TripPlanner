$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "backend"
$appDir = Join-Path $root "app"
$pidFile = Join-Path $PSScriptRoot ".local-processes.json"

Write-Host "Starting Wander local services against the real Entra External ID (Wander) tenant..." -ForegroundColor Cyan
Write-Host "EXPO_PUBLIC_DEV_USER_ID intentionally left unset so the Sign In screen actually shows." -ForegroundColor DarkGray
Write-Host "Sign in with Apple / Email OTP via the SignUpSignIn user flow." -ForegroundColor DarkGray

$backendProcess = Start-Process -FilePath "powershell" `
    -WorkingDirectory $backendDir `
    -ArgumentList @(
        "-NoExit",
        "-Command",
        "dotnet run --project .\Wander.Api --launch-profile http"
    ) `
    -PassThru

$appProcess = Start-Process -FilePath "powershell" `
    -WorkingDirectory $appDir `
    -ArgumentList @(
        "-NoExit",
        "-Command",
        "`$env:EXPO_PUBLIC_AUTH_ISSUER='https://wandertripapp.ciamlogin.com/wandertripapp.onmicrosoft.com/v2.0'; " +
        "`$env:EXPO_PUBLIC_AUTH_CLIENT_ID='b32700ac-b867-4a6a-a245-ceafc3c9de74'; " +
        "`$env:EXPO_PUBLIC_AUTH_AUDIENCE='b32700ac-b867-4a6a-a245-ceafc3c9de74'; " +
        "npm run web"
    ) `
    -PassThru

@{
    backendPid = $backendProcess.Id
    appPid = $appProcess.Id
    startedAt = (Get-Date).ToString("o")
} | ConvertTo-Json | Set-Content -Path $pidFile -Encoding UTF8

Write-Host "Backend PID: $($backendProcess.Id)" -ForegroundColor Green
Write-Host "App PID: $($appProcess.Id)" -ForegroundColor Green
Write-Host "Saved process info to $pidFile" -ForegroundColor DarkGray
Write-Host "Use scripts\stop-local.ps1 to stop both." -ForegroundColor Yellow
Write-Host "In the app, use Profile > Sign in (not the demo/guest path) to exercise the real Entra flow." -ForegroundColor Yellow
