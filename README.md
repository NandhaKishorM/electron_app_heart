# AI4Cardio - Electron App

Offline Desktop App for Multimodal ECG & Report Analysis.

HuggingFace Space For Inference: https://huggingface.co/spaces/convaiinnovations/ai4cardio

🚀 **[Download AI4Cardio Windows App (.exe) Here](https://storage.googleapis.com/courseai/AI4Cardio-Electron%20Setup%201.0.0.exe)**

![AI4Cardio Analysis Interface](assets/images/app_screenshot_1.png)
![AI4Cardio Heatmap Visualization](assets/images/app_screenshot_2.png)

## Prerequisites

- **Node.js**: v18 or higher
- **Yarn**: `npm install -g yarn`
- **Models**: Ensure `model/` directory contains:
  - `ggml-model-q4_k_m.gguf` (MedGemma-4B)
  - `mmproj-medgemma-4b-ecginstruct-F16.gguf` (Projector)
  - `vision_encoder_quant.onnx` (Vision Encoder)

## Development

1. **Install Dependencies**:

   ```bash
   yarn
   ```
2. **Start App**:

   ```bash
   yarn start
   ```

## Build Packages

To create standalone application packages for different operating systems:

### Windows (.exe)

1. Run the build script:
   ```cmd
   build.bat
   ```

### macOS (.dmg, .app)

1. Make the script executable and run:
   ```bash
   chmod +x build-mac.sh
   ./build-mac.sh
   ```

### Linux (.AppImage, .deb)

1. Make the script executable and run:
   ```bash
   chmod +x build-linux.sh
   ./build-linux.sh
   ```

**Note:** The output installers/packages will be placed in the `dist/` folder. Models are downloaded automatically upon the application's first launch.
