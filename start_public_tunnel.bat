@echo off
title APEX PULSE - Public Tunnel Link Generator
echo ===================================================
echo   APEX PULSE: Launching Public Internet Tunnel
echo ===================================================
echo Creating secure HTTPS link for judges and teammates...
"C:\Users\Tarun121\.bin\cloudflared.exe" tunnel --url http://localhost:5173
pause
