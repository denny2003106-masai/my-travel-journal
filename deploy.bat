@echo off
:: Navigate to project directory
cd /d C:\Users\den\.gemini\antigravity\scratch\travel-journal

echo ==================================================
echo        Travel Journal GitHub Auto-Deploy
echo ==================================================
echo.

:: Prompt for commit message in ASCII to prevent Windows encoding syntax crashes
set "msg="
set /p msg="Enter update message (Press Enter for default 'Fixed issues'): "

if "%msg%"=="" (
    set msg=Fixed issues
)

echo.
echo --------------------------------------------------
echo 1. Adding changes to staging (git add .)...
git add .

echo.
echo 2. Committing changes locally (git commit)...
git commit -m "%msg%"

echo.
echo 3. Pushing changes to GitHub (git push)...
git push

echo.
echo ==================================================
echo SUCCESS! 
echo Vercel will compile and redeploy in 30 seconds.
echo ==================================================
echo.
pause
