param(
    [string]$DevUserId = "local-dev-user"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "backend"
$appDir = Join-Path $root "app"
$pidFile = Join-Path $PSScriptRoot ".local-processes.json"

Write-Host "Starting Wander local services..." -ForegroundColor Cyan

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
        "`$env:EXPO_PUBLIC_DEV_USER_ID='$DevUserId'; npm run web"
    ) `
    -PassThru

@{
    backendPid = $backendProcess.Id
    appPid = $appProcess.Id
    startedAt = (Get-Date).ToString("o")
    devUserId = $DevUserId
} | ConvertTo-Json | Set-Content -Path $pidFile -Encoding UTF8

Write-Host "Backend PID: $($backendProcess.Id)" -ForegroundColor Green
Write-Host "App PID: $($appProcess.Id)" -ForegroundColor Green
Write-Host "Saved process info to $pidFile" -ForegroundColor DarkGray
Write-Host "Use scripts\stop-local.ps1 to stop both." -ForegroundColor Yellow
