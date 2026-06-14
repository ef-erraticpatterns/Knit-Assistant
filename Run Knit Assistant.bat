@echo off
title Knit Assistant
cd /d "%~dp0"

:: Kill any previous instance on port 5001
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5001 "') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo Installing / checking dependencies...
pip install fastapi uvicorn python-multipart --quiet

echo.
echo Starting Knit Assistant on http://0.0.0.0:5001 ...
echo.
echo Local:     http://127.0.0.1:5001
echo Tailscale: http://100.90.216.125:5001
echo.
echo Press Ctrl+C to stop.
echo.

start "" http://127.0.0.1:5001
uvicorn server:app --host 0.0.0.0 --port 5001 --reload
