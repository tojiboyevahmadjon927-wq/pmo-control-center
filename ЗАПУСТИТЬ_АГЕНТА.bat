@echo off
chcp 65001 >nul
title PMO AI Agent — Турон Телеком

echo.
echo ╔══════════════════════════════════════════╗
echo ║        PMO AI AGENT — Турон Телеком      ║
echo ╚══════════════════════════════════════════╝
echo.

REM Check if node is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js не найден! Установи с nodejs.org
    pause
    exit /b 1
)

REM Check config
if not exist "%~dp0agent_config.json" (
    echo ❌ agent_config.json не найден!
    pause
    exit /b 1
)

echo ✅ Запускаю агента...
echo 📱 Откроется в Telegram (если настроен)
echo 🌐 HTTP интерфейс: http://localhost:8081/agent
echo.
echo Для остановки: Ctrl+C
echo.

cd /d "%~dp0"
node agent.js

pause
