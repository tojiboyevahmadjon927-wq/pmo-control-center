@echo off
chcp 65001 >nul
title PMO Control Center - Server
color 0A
cd /d "%~dp0"
echo.
if not exist node_modules (
    echo  Installing packages...
    npm install express mysql2 cors
)
echo  Starting PMO server...
echo.
node server.js
pause
