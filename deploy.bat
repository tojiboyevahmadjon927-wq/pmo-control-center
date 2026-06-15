@echo off
title PMO Deploy
cd /d "C:\Users\User\OneDrive\Desktop\сайт"

echo [1/4] Remove lock file...
if exist ".git\index.lock" del /f ".git\index.lock"

echo [2/4] Git commit and push...
git add .
git commit -m "update"
git push origin main

echo [3/4] Deploy to VPS...
ssh root@10.128.32.120 "cd /var/www/pmo-control-center && git pull origin main && DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker compose up -d --build"

echo.
echo ============================
echo DONE! Press Ctrl+Shift+R
echo ============================
pause
