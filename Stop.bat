@echo off
title Shopify Auto-Lister — Stop
color 0C

echo.
echo  Stopping Shopify Auto-Lister...
echo.

taskkill /f /im node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo  App stopped successfully.
) else (
    echo  App was not running.
)

echo.
timeout /t 2 /nobreak >nul
