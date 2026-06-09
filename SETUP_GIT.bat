@echo off
echo ============================================
echo   PMO - GitHub Setup
echo ============================================
echo.

echo [1/6] Removing old .git if exists...
if exist ".git" rmdir /s /q ".git"

echo [2/6] Creating .gitignore...
(
echo node_modules/
echo npm-debug.log
echo agent_config.json
echo pmo_data.json
echo team_link.txt
echo .DS_Store
echo Thumbs.db
) > .gitignore

echo [3/6] Initializing git...
git init
git config user.name "Ahmadjon"
git config user.email "tojiboyevahmadjon927@gmail.com"

echo [4/6] Adding files (secrets excluded by .gitignore)...
git add -A
git status --short

echo [5/6] First commit...
git commit -m "PMO Control Center - initial commit"

echo [6/6] Pushing to GitHub...
git branch -M main
git remote add origin https://github.com/tojiboyevahmadjon927-wq/pmo-control-center.git
git push -u origin main --force

echo.
echo ============================================
echo   Done! Check your repo:
echo   https://github.com/tojiboyevahmadjon927-wq/pmo-control-center
echo ============================================
pause
