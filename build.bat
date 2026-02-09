@echo off
echo ===========================================
echo Building AI4Cardio Electron App for Windows
echo ===========================================

echo [0/3] Cleaning previous build...
if exist dist rmdir /s /q dist

echo [1/3] Installing Dependencies...
call yarn install

echo [2/3] Rebuilding Native Modules...
call .\node_modules\.bin\electron-rebuild

echo [3/3] Packaging Application...
call .\node_modules\.bin\electron-builder --win

echo ===========================================
echo Build Complete! Check the 'dist' folder.
echo ===========================================
pause
