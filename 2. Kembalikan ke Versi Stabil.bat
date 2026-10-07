@echo off
setlocal enabledelayedexpansion
title FH Audio - Kembalikan ke Versi Stabil (Rollback)
color 0c
cd /d "%~dp0"

echo ====================================================================
echo        FH AUDIO - KEMBALIKAN KE VERSI STABIL (ROLLBACK)
echo ====================================================================
echo.
echo  [PERINGATAN]
echo  File kode proyek saat ini akan dikembalikan ke titik stabil
echo  terakhir (Tag Git: 'stable').
echo  Perubahan yang sedang rusak / error akan dibatalkan otomatis.
echo.
echo ====================================================================
echo.
set /p "CONFIRM=Apakah Anda yakin ingin mengembalikan kode ke versi stabil? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo.
    echo [DIBATALKAN] Pemulihan dibatalkan oleh pengguna.
    echo.
    pause
    exit /b 0
)

echo.
echo [1/2] Memulihkan kode dari titik stabil Git...
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [PERINGATAN] Git tidak terdeteksi. Silakan pulihkan manual dari folder _backups\.
    pause
    exit /b 1
)

:: Cek apakah tag stable ada
git rev-parse stable >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Titik stabil 'stable' belum ditemukan.
    echo Jalankan "1. Simpan Titik Stabil.bat" terlebih dahulu untuk membuat titik stabil.
    pause
    exit /b 1
)

:: Rollback ke tag stable
git reset --hard stable
git clean -fd

color 0a
echo.
echo ====================================================================
echo  [SUKSES] KODE BERHASIL DIKEMBALIKAN KE VERSI STABIL!
echo.
echo  Semua file telah pulih seperti kondisi saat Anda menyimpan titik
echo  stabil terakhir. Silakan refresh halaman browser Anda.
echo ====================================================================
echo.
pause
