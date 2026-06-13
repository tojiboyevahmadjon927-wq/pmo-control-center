@echo off
set DOCKER_BUILDKIT=0
set COMPOSE_DOCKER_CLI_BUILD=0
echo ============================================
echo   PMO Control Center - Docker Launch
echo ============================================
echo.
echo Building and starting containers (site + MySQL + AI agent)...
echo This may take a few minutes on first run.
echo.
docker compose up -d --build
echo.
echo ============================================
echo   Done! Open in your browser:
echo   http://localhost:8300
echo.
echo   AI agent runs on port 8081
echo   MySQL runs on port 3306
echo ============================================
echo.
echo Useful commands:
echo   Stop:     docker compose down
echo   Logs:     docker compose logs -f
echo   Restart:  docker compose restart
echo.
pause
