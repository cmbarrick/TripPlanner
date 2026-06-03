@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\start-cloud-web.ps1" %*
endlocal
