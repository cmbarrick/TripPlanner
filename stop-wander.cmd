@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\stop-local.ps1"
endlocal
