@echo off
chcp 65001 >nul
echo.
echo ============================================
echo   Seha SickLeave - Local Server Start
echo ============================================
echo.

cd /d "%~dp0"

REM Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found! Install from https://nodejs.org/
    pause
    exit /b 1
)

REM Install dependencies if needed
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    npm install
    echo [OK] Dependencies installed!
)

echo.
echo [INFO] Starting Seha SickLeave Server...
echo [INFO] The bot will work as long as this window is open.
echo [INFO] Press Ctrl+C to stop.
echo.

node server.js

pause
