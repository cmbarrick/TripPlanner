$ErrorActionPreference = "Stop"

$pidFile = Join-Path $PSScriptRoot ".local-processes.json"

if (!(Test-Path $pidFile)) {
    Write-Host "No local process file found. Nothing to stop." -ForegroundColor Yellow
    exit 0
}

$processInfo = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
$pids = @($processInfo.backendPid, $processInfo.appPid) | Where-Object { $_ }

foreach ($processId in $pids) {
    try {
        $process = Get-Process -Id $processId -ErrorAction Stop
        Stop-Process -Id $process.Id -Force
        Write-Host "Stopped PID $processId ($($process.ProcessName))." -ForegroundColor Green
    }
    catch {
        Write-Host "PID $processId was already stopped." -ForegroundColor DarkYellow
    }
}

Remove-Item -Path $pidFile -Force
Write-Host "Local services stopped." -ForegroundColor Cyan
