@echo off
chcp 65001 >nul
title PMO - Install
color 0A
cd /d "%~dp0"
echo.
echo ================================================
echo  PMO Control Center - Installing...
echo ================================================
echo.
echo [1] Checking Node.js...
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Node.js not found!
  echo Download: https://nodejs.org
  pause & exit
)
for /f %%v in ('node --version') do echo [OK] Node.js %%v
echo.
echo [2] Installing packages (express, mysql2, cors)...
npm install express mysql2 cors
if %ERRORLEVEL% NEQ 0 (
  echo ERROR installing packages!
  pause & exit
)
echo [OK] Packages installed!
echo.
echo ================================================
echo  Done! Now run: LAUNCH_SERVER.bat
echo  For MySQL: mysql -u root -p < setup.sql
echo ================================================
echo.
pause
