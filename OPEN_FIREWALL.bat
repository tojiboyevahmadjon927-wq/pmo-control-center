@echo off
chcp 65001 >nul
title PMO - Open Firewall Port 8080

echo.
echo ================================================
echo  Opening port 8080 for PMO Control Center...
echo ================================================
echo.

:: Check admin rights
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: Run this file as Administrator!
    echo  Right-click -> "Run as administrator"
    echo.
    pause
    exit
)

:: Remove old rule if exists
netsh advfirewall firewall delete rule name="PMO Control Center" >nul 2>&1

:: Add new rule
netsh advfirewall firewall add rule name="PMO Control Center" dir=in action=allow protocol=TCP localport=8080
if %ERRORLEVEL% EQU 0 (
    echo  [OK] Port 8080 opened successfully!
) else (
    echo  [ERROR] Could not open port. Try manually.
)

echo.
echo ================================================
echo  Done! Now teammates can connect via:
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
    set ip=%%a
    goto show
)
:show
echo    http:%ip%:8080
echo.
echo  Make sure server.js is running (LAUNCH_SERVER.bat)
echo ================================================
echo.
pause
