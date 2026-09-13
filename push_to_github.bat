@echo off
title APEX PULSE — Deploy to GitHub
color 0A

echo ======================================================================
echo    APEX PULSE: Deploying to GitHub Repository
echo    https://github.com/vinu72496-cmd/APEX-PULSE.git
echo ======================================================================
echo.

cd /d "%~dp0"
set "PATH=C:\Users\Tarun121\.bin\git\cmd;%PATH%"

echo Verifying Git repository status...
git status -s

echo.
echo Pushing branch 'main' to origin...
echo (If prompted, sign in to your GitHub account in the browser or enter your Personal Access Token)
echo.

git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ======================================================================
    echo   SUCCESS! APEX PULSE has been deployed to your GitHub repository:
    echo   https://github.com/vinu72496-cmd/APEX-PULSE
    echo ======================================================================
) else (
    echo.
    echo ======================================================================
    echo   Push encountered an error. If authentication failed:
    echo   1. Create a GitHub Personal Access Token at:
    echo      https://github.com/settings/tokens (select 'repo' scope)
    echo   2. Run this script again and use the token as your password.
    echo ======================================================================
)

echo.
pause
