# Stops the Expo/Metro web dev server started by start-cloud-web.ps1.
# That script runs Expo in the foreground (no PID file), so we find the dev
# server by the TCP ports it listens on and stop the owning process(es).

$ErrorActionPreference = "Stop"

# Metro grabs the next free port when one is taken, so a few stale servers can
# pile up across 8081..8090. Scan the whole range plus the classic Expo ports.
$ports = @(8081..8090) + @(19000, 19001, 19006)
$stopped = @()

foreach ($port in $ports) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    }
    catch {
        $conns = $null
    }

    foreach ($conn in $conns) {
        $procId = $conn.OwningProcess
        if ($procId -and ($stopped -notcontains $procId)) {
            try {
                $proc = Get-Process -Id $procId -ErrorAction Stop
                Stop-Process -Id $procId -Force
                Write-Host "Stopped PID $procId ($($proc.ProcessName)) on port $port." -ForegroundColor Green
                $stopped += $procId
            }
            catch {
                Write-Host "Could not stop PID $procId on port $port: $($_.Exception.Message)" -ForegroundColor DarkYellow
            }
        }
    }
}

if ($stopped.Count -eq 0) {
    Write-Host "No Expo web dev server found on ports $($ports -join ', '). Nothing to stop." -ForegroundColor Yellow
}
else {
    Write-Host "Expo web dev server stopped." -ForegroundColor Cyan
}
