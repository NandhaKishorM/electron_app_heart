@echo off
echo ==========================================
echo      AI4Cardio - Windows Build Script
echo ==========================================

echo.
echo [1/3] Creating placeholder folders (models downloaded at runtime)...
if not exist "model" mkdir model
if not exist "onnx_export" mkdir onnx_export

echo.
echo [2/3] Building Win64 Executable...
call yarn electron-builder --win --x64

echo.
echo [3/3] Build Complete!
echo Models will be downloaded automatically on first launch.
echo Check the 'dist' folder for your installer.
pause
