@echo off
setlocal enabledelayedexpansion
title FH Audio - Portable Launcher
cd /d "%~dp0"

echo ========================================================
echo        FH AUDIO V2 - PORTABLE LAUNCHER
echo ========================================================
echo.

:: 1. Deteksi executable Python yang tersedia di sistem
set "PY_CMD="
python --version >nul 2>&1
if not errorlevel 1 (
    set "PY_CMD=python"
) else (
    py -3 --version >nul 2>&1
    if not errorlevel 1 (
        set "PY_CMD=py -3"
    ) else (
        py --version >nul 2>&1
        if not errorlevel 1 (
            set "PY_CMD=py"
        )
    )
)

:: 2. Jika Python tidak terpasang di komputer ini, fallback ke Standalone Mode
if "%PY_CMD%"=="" (
    echo [INFO] Python tidak terdeteksi di komputer ini.
    echo Menjalankan FH Audio langsung di browser dalam Mode Standalone (Offline)...
    echo.
    timeout /t 2 /nobreak >nul
    start "" "index.html"
    exit /b 0
)

:: 3. Bersihkan proses python lama jika port 5500 masih tersangkut
echo Memeriksa status port 5500...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /R /C:":5500 .*LISTENING"') do (
    tasklist /fi "PID eq %%a" 2>nul | findstr /i "python" >nul
    if not errorlevel 1 (
        echo [INFO] Membersihkan sisa server sebelumnya (PID: %%a)...
        taskkill /f /pid %%a >nul 2>&1
    )
)

:: 4. Jalankan server lokal di background
echo Menjalankan FH Audio Server...
start "FH Audio Server" /min %PY_CMD% server.py

:: 5. Tunggu hingga server benar-benar merespons
set "SERVER_READY=0"
for /l %%i in (1,1,10) do (
    if "!SERVER_READY!"=="0" (
        netstat -ano 2>nul | findstr /R /C:":5500 .*LISTENING" >nul
        if not errorlevel 1 (
            set "SERVER_READY=1"
        ) else (
            timeout /t 1 /nobreak >nul
        )
    )
)

:: 6. Buka aplikasi di browser
if "!SERVER_READY!"=="1" (
    echo [SUKSES] Server aktif di port 5500!
    echo Membuka aplikasi di browser...
    start "" http://localhost:5500
) else (
    echo [INFO] Membuka aplikasi di browser...
    start "" http://localhost:5500
)

timeout /t 2 /nobreak >nul
exit /b 0
