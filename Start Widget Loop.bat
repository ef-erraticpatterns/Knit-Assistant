@echo off
title Knit Assistant — Widget Loop
cd /d "%~dp0"
echo.
echo Starting Knit Assistant widget loop...
echo Claude will pick up tasks automatically as they arrive.
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0widget_loop.ps1"
pause
