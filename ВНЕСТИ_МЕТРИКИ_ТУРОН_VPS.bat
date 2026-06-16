@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "turon_metrics_update_vps.ps1"
