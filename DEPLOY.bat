@echo off
chcp 65001 >nul
echo.
echo ============================================
echo    Seha SickLeave - Auto Deploy Script
echo ============================================
echo.

REM Check if git is installed
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed!
    echo.
    echo Please install Git from: https://git-scm.com/download/win
    echo After installing, restart this script.
    pause
    exit /b 1
)

echo [OK] Git found!

REM Check if node is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo After installing, restart this script.
    pause
    exit /b 1
)

echo [OK] Node.js found!

set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

echo.
echo [STEP 1] Initializing Git repository...
if not exist ".git" (
    git init
    echo [OK] Git initialized
) else (
    echo [OK] Git already initialized
)

echo.
echo [STEP 2] Adding files to Git...
git add server.js index.html style.css app.js default_logo.png package.json subscriptions.json .gitignore
echo [OK] Files added

echo.
echo [STEP 3] Committing changes...
git commit -m "Deploy Seha SickLeave App" --allow-empty
echo [OK] Committed

echo.
echo ============================================
echo   NEXT STEPS (Manual - One Time Only):
echo ============================================
echo.
echo 1. Go to: https://github.com/new
echo 2. Repository name: seha-sickleave-app
echo 3. Make it Private, do NOT add README
echo 4. Click "Create repository"
echo 5. Copy the HTTPS URL (like: https://github.com/YOUR_USERNAME/seha-sickleave-app.git)
echo.
set /p REPO_URL="Paste your GitHub repo URL here and press Enter: "

if "%REPO_URL%"=="" (
    echo [ERROR] No URL provided. Exiting.
    pause
    exit /b 1
)

echo.
echo [STEP 4] Connecting to GitHub...
git remote remove origin >nul 2>&1
git remote add origin %REPO_URL%
echo [OK] Remote added: %REPO_URL%

echo.
echo [STEP 5] Pushing to GitHub...
git branch -M main
git push -u origin main

if %errorlevel% neq 0 (
    echo.
    echo [NOTE] If prompted for credentials, enter your GitHub username and Personal Access Token
    echo        To create a token: https://github.com/settings/tokens/new
    echo        Select 'repo' scope, then use the token as your password.
    echo.
    pause
    git push -u origin main
)

echo.
echo ============================================
echo   SUCCESS! Code pushed to GitHub!
echo ============================================
echo.
echo Now go to Render to deploy:
echo.
echo 1. Go to: https://render.com
echo 2. Sign in with GitHub
echo 3. Click New ^> Web Service
echo 4. Connect repo: seha-sickleave-app
echo 5. Settings:
echo    - Build Command: npm install
echo    - Start Command: node server.js
echo    - Plan: Free
echo 6. Add Environment Variables:
echo    TELEGRAM_BOT_TOKEN = <YOUR_TELEGRAM_BOT_TOKEN>
echo    WEB_APP_URL = https://seha-sickleave-app.onrender.com
echo    ADMIN_USERNAME = <YOUR_TELEGRAM_USERNAME>
echo    TELEGRAM_CHANNEL_ID = <YOUR_TELEGRAM_CHANNEL_ID>
echo    NODE_ENV = production
echo 7. Click "Create Web Service"
echo.
echo After deploy, visit: https://seha-sickleave-app.onrender.com/setup
echo.
echo Then set up UptimeRobot:
echo 1. Go to: https://uptimerobot.com
echo 2. Create free account
echo 3. Add Monitor: HTTP(s), URL: https://seha-sickleave-app.onrender.com, every 5 min
echo.
pause
