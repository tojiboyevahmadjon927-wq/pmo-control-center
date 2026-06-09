@echo off
set /p msg=Describe your changes (e.g. "fixed kanban bug"):
git add -A
git commit -m "%msg%"
git push
echo.
echo Saved to GitHub!
pause
