@echo off
setlocal EnableExtensions
chcp 65001 >nul

title STARK INDUSTRIES // J.A.R.V.I.S. MARK LXXXV HUD

:: Switch to the project directory (supports paths with spaces and Unicode)
cd /d "%~dp0"

:: Verify Node.js is installed and in PATH
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [J.A.R.V.I.S. CRITICAL FAULT] Node.js was not found in your system PATH.
    echo Please install Node.js ^(v20.6.0 or higher^) from https://nodejs.org/
    pause
    exit /b 1
)

:: Launch the unified J.A.R.V.I.S. runner and forward any arguments
node "%~dp0run.js" %*
set "EXIT_CODE=%ERRORLEVEL%"

if %EXIT_CODE% neq 0 (
    echo.
    echo [J.A.R.V.I.S. SYSTEM] Process exited with code %EXIT_CODE%.
    pause
)

exit /b %EXIT_CODE%
