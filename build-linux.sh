#!/bin/bash
echo "=========================================="
echo "     AI4Cardio - Linux Build Script"
echo "=========================================="

echo ""
echo "[1/3] Creating placeholder folders (models downloaded at runtime)..."
mkdir -p model
mkdir -p onnx_export

echo ""
echo "[2/3] Building Linux Executables (.AppImage, .deb)..."
yarn electron-builder --linux

echo ""
echo "[3/3] Build Complete!"
echo "Models will be downloaded automatically on first launch."
echo "Check the 'dist' folder for your installer."
