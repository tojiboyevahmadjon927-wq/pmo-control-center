@echo off
title PMO Deploy
cd /d "C:\Users\User\OneDrive\Desktop\сайт"

echo [1/4] Remove lock file...
if exist ".git\index.lock" del /f ".git\index.lock"

echo [2/4] Git commit and push...
git add .
git commit -m "update"
git push origin main

echo [3/4] Checking connection to VPS (10.128.32.120)...
ping -n 1 -w 2000 10.128.32.120 >nul 2>&1
if errorlevel 1 (
  echo.
  echo ============================
  echo  OSHIBKA: VPS 10.128.32.120 NEDOSTUPEN!
  echo  Site code on GitHub is updated, but the VPS was NOT rebuilt.
  echo  Check: are you connected to the VPN/network that can reach this VPS?
  echo  Open VPN client and connect, then run this script again.
  echo ============================
  pause
  exit /b 1
)

echo [4/4] Deploy to VPS...
ssh root@10.128.32.120 "cd /var/www/pmo-control-center && git pull origin main && DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker compose up -d --build"
if errorlevel 1 (
  echo.
  echo ============================
  echo  OSHIBKA: SSH/Docker rebuild step FAILED!
  echo  GitHub has the new code, but the VPS still runs the OLD code.
  echo  Run this script again, or deploy manually via SSH.
  echo ============================
  pause
  exit /b 1
)

echo.
echo ============================
echo DONE! VPS rebuilt successfully. Press Ctrl+Shift+R on the site.
echo ============================
pause
