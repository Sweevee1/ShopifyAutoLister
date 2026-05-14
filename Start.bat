@echo off
setlocal
title Shopify Auto-Lister
color 0A

echo.
echo  ==========================================
echo   Shopify Auto-Lister
echo  ==========================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js is not installed.
    echo.
    echo  Download it from https://nodejs.org
    echo  Install it, then run this file again.
    echo.
    pause
    exit /b 1
)

:: Install dependencies on first run
if not exist "node_modules" (
    echo  Installing dependencies ^(first run only, may take a minute^)...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo  ERROR: Installation failed. Check the output above.
        pause
        exit /b 1
    )
    echo.
)

:: Copy .env if it doesn't exist yet
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo  Created .env from .env.example
        echo.
    )
)

echo  Starting server...
echo  Your browser will open automatically.
echo.
echo  Close this window to stop the app.
echo  ==========================================
echo.

:: Open browser after 3 seconds (gives the server time to start)
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: Start the dev server (keeps this window alive)
npm run dev

pause
