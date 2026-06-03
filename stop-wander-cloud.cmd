@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\stop-cloud-web.ps1" %*
endlocal
