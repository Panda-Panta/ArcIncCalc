@echo off
setlocal EnableExtensions
title Arknights RIIC Income Calculator - Shift Run

cd /d "%~dp0"

echo.
echo  ========================================
echo    Arknights RIIC Income Calculator - Shift Run
echo  ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found.
    echo Install Node.js 20 or newer, then run this script again.
    echo.
    pause
    exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Git was not found. This launcher needs Git to verify the edition branch.
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%B in ('git -c "safe.directory=%CD:\=/%" branch --show-current 2^>nul') do set "CURRENT_BRANCH=%%B"
if /i not "%CURRENT_BRANCH%"=="mode/shift-run" (
    echo [STOP] This launcher only starts the shift-run edition.
    echo [INFO] Current branch: %CURRENT_BRANCH%
    echo [INFO] Open the mode/shift-run worktree, then run this script again.
    echo.
    pause
    exit /b 1
)

set "PNPM_COMMAND="
where pnpm >nul 2>nul
if not errorlevel 1 set "PNPM_COMMAND=pnpm"

if not defined PNPM_COMMAND (
    where corepack >nul 2>nul
    if not errorlevel 1 set "PNPM_COMMAND=corepack pnpm"
)

if not defined PNPM_COMMAND (
    echo [ERROR] pnpm and Corepack were not found.
    echo Run corepack enable or install pnpm, then try again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\.modules.yaml" (
    echo [SETUP] Installing project dependencies for the first run...
    call %PNPM_COMMAND% install
    if errorlevel 1 (
        echo.
        echo [ERROR] Dependency installation failed. Check the messages above.
        pause
        exit /b 1
    )
    echo.
)

if /i "%~1"=="--check" (
    echo [OK] Node.js, pnpm, and project dependencies are ready.
    exit /b 0
)

echo [START] Starting the shift-run edition...
echo [URL] http://127.0.0.1:5173/
echo [BRANCH] mode/shift-run verified.
echo [TIP] Close this window to stop the application.
echo.

start "" /b powershell.exe -NoLogo -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:5173/'"
call %PNPM_COMMAND% dev --host 127.0.0.1 --port 5173 --strictPort

echo.
echo The application has stopped.
pause
endlocal
