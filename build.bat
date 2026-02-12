@echo off
echo ==========================================
echo      AI4Cardio - Windows Build Script
echo ==========================================

echo.
echo [1/3] Clean & Install Dependencies...
call yarn install

echo.
echo [2/3] Building Win64 Executable...
call yarn electron-builder --win --x64

echo.
echo [3/3] Build Complete!
echo check the 'dist' folder for your installer.
pause
