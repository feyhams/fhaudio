@echo off
setlocal enabledelayedexpansion
title FH Audio - Simpan Titik Stabil (Checkpoint)
color 0a
cd /d "%~dp0"

echo ====================================================================
echo        FH AUDIO - SIMPAN TITIK STABIL (VERSION CHECKPOINT)
echo ====================================================================
echo.

:: Dapatkan tanggal dan jam format rapi
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value 2^>nul') do set datetime=%%I
if "%datetime%"=="" (
    set "STAMP=%date:/=-%_%time::=-%"
    set "STAMP=!STAMP: =_!"
) else (
    set "STAMP=%datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2%_%datetime:~8,2%-%datetime:~10,2%-%datetime:~12,2%"
)

echo [1/3] Memeriksa status Git...
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [PERINGATAN] Git tidak terdeteksi. Hanya membuat backup folder fisik...
    goto PHYSICAL_BACKUP
)

:: Git Add & Commit
echo [2/3] Merekam titik stabil ke riwayat Git...
git add -A
git commit -m "checkpoint: Simpan versi stabil pada %STAMP%" --allow-empty >nul 2>&1

:: Perbarui tag 'stable' dan buat tag historis
git tag -f stable >nul 2>&1
git tag "checkpoint_%STAMP%" >nul 2>&1

:PHYSICAL_BACKUP
echo [3/3] Membuat arsip cadangan fisik ke folder _backups...
set "DEST=_backups\backup_%STAMP%"
if not exist "%DEST%" mkdir "%DEST%"

:: Salin file-file utama (kecuali cache & git)
xcopy /E /I /Q /Y "src" "%DEST%\src" >nul 2>&1
xcopy /E /I /Q /Y "api" "%DEST%\api" >nul 2>&1
xcopy /E /I /Q /Y "data" "%DEST%\data" >nul 2>&1
copy /Y "index.html" "%DEST%\" >nul 2>&1
copy /Y "server.py" "%DEST%\" >nul 2>&1
copy /Y "AGENTS.md" "%DEST%\" >nul 2>&1

echo.
echo ====================================================================
echo  [SUKSES] TITIK STABIL BERHASIL DISIMPAN!
echo  - Tag Git       : stable (dan checkpoint_%STAMP%)
echo  - Folder Arsip  : %DEST%
echo.
echo  Jika suatu saat aplikasi bermasalah / rusak, jalankan:
echo  "2. Kembalikan ke Versi Stabil.bat"
echo ====================================================================
echo.
pause
