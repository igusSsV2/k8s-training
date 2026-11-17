@echo off
powershell.exe -NoProfile -File "%~dp0Start-K8Training.ps1"
if errorlevel 1 pause
