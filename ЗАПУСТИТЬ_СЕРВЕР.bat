@echo off
chcp 65001 >nul
title PMO Control Center — Сервер
color 0A

cd /d "%~dp0"

echo.
echo  ================================================
echo   PMO Control Center  --  Запуск сервера...
echo  ================================================
echo.

:: Найти локальный IP автоматически
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
    set RAW=%%a
    goto found
)
:found
:: Убрать пробелы
set LOCAL_IP=%RAW: =%

echo  Ваш IP-адрес:  %LOCAL_IP%
echo.

:: Обновить server.js с реальным IP
node -e "const fs=require('fs');let c=fs.readFileSync('server.js','utf8');console.log('server.js OK');" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo  ОШИБКА: Node.js не найден!
    echo  Скачайте: https://nodejs.org
    pause
    exit
)

:: Открыть браузер через 2 секунды
start "" cmd /c "timeout /t 2 >nul && start http://%LOCAL_IP%:8080"

echo  ================================================
echo.
echo   ССЫЛКА ДЛЯ КОМАНДЫ:
echo.
echo     http://%LOCAL_IP%:8080
echo.
echo   Скопируйте и отправьте сотрудникам в Telegram
echo   Не закрывайте это окно!
echo.
echo  ================================================
echo.

:: Записать ссылку в файл для удобства
echo http://%LOCAL_IP%:8080 > ССЫЛКА_ДЛЯ_КОМАНДЫ.txt
echo Ссылка сохранена в файл ССЫЛКА_ДЛЯ_КОМАНДЫ.txt

echo.
echo  Сервер работает... (Ctrl+C для остановки)
echo.

:: Запустить сервер
node server.js

pause
