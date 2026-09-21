@echo off
chcp 65001 >nul 2>&1
echo.
echo ============================================
echo   Seha SickLeave - Deploy to GitHub
echo ============================================
echo.

cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install from: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js found. Starting upload to GitHub...
echo.

node auto-deploy-github.js

echo.
echo Press any key to close...
pause >nul
