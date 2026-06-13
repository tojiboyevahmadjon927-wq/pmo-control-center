@echo off
set DOCKER_BUILDKIT=0
set COMPOSE_DOCKER_CLI_BUILD=0
echo ============================================
echo   PMO - Обновление (данные НЕ удаляются)
echo ============================================
echo.
echo Пересборка приложения без потери данных...
echo.
docker compose up -d --build
echo.
echo ============================================
echo   Готово! Сайт: http://localhost:8300
echo ============================================
echo.
echo ВАЖНО: данные в MySQL сохранены.
echo Для ПОЛНОГО сброса (удалить все данные):
echo   docker compose down -v
echo ============================================
echo.
pause
