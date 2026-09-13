@echo off
title APEX PULSE - Universal Launcher
echo ===================================================
echo   APEX PULSE: Formula 1 AI Race Strategy System
echo ===================================================
echo Starting Backend and Frontend services...

cd /d "%~dp0"

start "APEX PULSE Backend (Port 8000)" cmd /k "cd /d "%~dp0backend" && "%~dp0.venv\Scripts\python.exe" -m uvicorn main:app --port 8000 --host 0.0.0.0"

timeout /t 2 /nobreak >nul

start "APEX PULSE Frontend (Port 5173)" cmd /k "cd /d "%~dp0apex_pulse\frontend" && set "PATH=C:\Users\Tarun121\.bin\node-v20.18.0-win-x64;%PATH%" && npm run dev -- --host 0.0.0.0"

timeout /t 3 /nobreak >nul

start http://localhost:5173/#all

echo.
echo ======================================================================
echo   APEX PULSE IS NOW LIVE!
echo ======================================================================
echo.
echo   UNIVERSAL ALL-IN-ONE LINK (Local):
echo   http://localhost:5173/#all
echo.
echo   PUBLIC SHAREABLE LINK (Any Device / Internet):
echo   https://beijing-outdoors-anonymous-laws.trycloudflare.com/#all
echo.
echo   Switch tabs anytime using the persistent top navigation bar!
echo ======================================================================
echo.
pause
