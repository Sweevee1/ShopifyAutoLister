@echo off
setlocal
title Shopify Auto-Lister
color 0A

echo.
echo  ==========================================
echo   Shopify Auto-Lister
echo  ==========================================
echo.

:: ── Check Node.js ──────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js is not installed.
    echo.
    echo  Node.js is required to run this app. To install it:
    echo.
    echo    1. Go to  https://nodejs.org
    echo    2. Download the "LTS" version ^(recommended^)
    echo    3. Run the installer — keep all default options
    echo    4. Restart your PC, then double-click Start.bat again
    echo.
    echo  Opening nodejs.org in your browser now...
    start https://nodejs.org
    pause
    exit /b 1
)

:: ── Install dependencies on first run ──────────────────────────────────────
if not exist "node_modules" (
    echo  Installing dependencies ^(first run only, takes about a minute^)...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo  ERROR: npm install failed. Check the output above.
        pause
        exit /b 1
    )
    echo.
)

:: ── Copy .env if missing ───────────────────────────────────────────────────
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo  Created .env — you can add API keys there or in the app's Settings panel.
        echo.
    )
)

:: ── Check AI provider ──────────────────────────────────────────────────────
where ollama >nul 2>&1
set OLLAMA_FOUND=%errorlevel%

if %OLLAMA_FOUND% neq 0 (
    echo  ── AI Provider Setup ──────────────────────────────────────────
    echo.
    echo  No AI provider detected. You need one of the following:
    echo.
    echo  OPTION A — Ollama ^(free, runs on your PC^):
    echo    1. Go to  https://ollama.com  and download Ollama
    echo    2. Install it, then open a NEW terminal window and run:
    echo         ollama pull qwen3:8b
    echo         ollama serve
    echo    3. Come back and run Start.bat again
    echo.
    echo  OPTION B — Claude API ^(cloud, faster, no local install^):
    echo    1. Go to  https://console.anthropic.com  and create an account
    echo    2. Generate an API key
    echo    3. Start the app below, then open Settings and enter your key
    echo.
    echo  ───────────────────────────────────────────────────────────────
    echo.
    echo  If you've chosen Option B, the app will open now.
    echo  If you've chosen Option A, close this window and set up Ollama first.
    echo.
    choice /c YN /m "Continue and open the app now?"
    if %errorlevel% neq 1 exit /b 0
    echo.
) else (
    :: Ollama is installed — check if it's actually running
    curl -s http://localhost:11434 >nul 2>&1
    if %errorlevel% neq 0 (
        echo  Note: Ollama is installed but not running.
        echo  Open a separate terminal and run:  ollama serve
        echo.
    )
)

:: ── Start ──────────────────────────────────────────────────────────────────
echo  Starting Shopify Auto-Lister...
echo  Opening http://localhost:3000 in your browser in a moment.
echo.
echo  To stop the app: run Stop.bat, or close this window.
echo  ==========================================
echo.

start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"
start "Shopify Auto-Lister Server" /wait cmd /k "npm run dev"
