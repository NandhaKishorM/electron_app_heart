# Attention Interpretation System Design

## Overview
The AI4Cardio system employs a **Vision Transformer (ViT) based Attention Mechanism** to provide interpretability for its ECG analysis. Instead of acting as a "black box," the model outputs an attention map that highlights the specific regions of the ECG signal (e.g., ST segments, T-waves) that most influenced its diagnostic decision.

## Technical Pipeline

### 1. Vision Encoder (ONNX)
The core of the visual analysis is a quantized ONNX model:
- **Model Path:** `onnx_export/vision_encoder_quant.onnx`
- **Input Resolution:** 896x896 pixels (High resolution to capture fine ECG grid details).
- **Architecture:** The encoder treats the ECG image as a sequence of patches, typical of Vision Transformers.

### 2. Preprocessing
To ensure the model "sees" the image correctly, raw inputs undergo specific transformations:
- **Resizing:** Images are resized to **896x896** using bilinear interpolation.
- **Normalization:** Pixel values are normalized using standard ImageNet mean and standard deviation:
    - Mean: `[0.485, 0.456, 0.406]`
    - Std: `[0.229, 0.224, 0.225]`
- **Tensor Format:** Converted to `Float32` tensor with shape `[1, 3, 896, 896]` (Batch, Channels, Height, Width).

### 3. Attention Map Extraction
Post-inference, the system extracts the raw attention weights from the model's output tensors:
1.  **Tensor Selection:** The worker scans output tensors for keywords like `attention` or `att`. If not explicitly named, it selects the second output tensor (common in ViT exports).
2.  **Reshaping:** The flat sequence of attention scores (Sequence Length) is reshaped into a 2D grid:
    - `Grid Size = sqrt(Sequence Length)`
    - This creates a low-resolution "map" of importance (e.g., 28x28 or 14x14 patches).

### 4. Heatmap Generation Logic
The raw attention values are processed to create a human-readable visual overlay:

**A. Normalization & Contrast Stretching**
Raw attention scores are often very small numerical values. We apply Min-Max normalization followed by a specific clamping logic to remove noise and highlight strong signals:
```javascript
// Remove background noise (vmin) and boost weak signals (vmax)
val = (val - 0.3) / (0.7 - 0.3);
val = Math.max(0, Math.min(1, val)); // Clip to 0-1 range
```

**B. Inversion & Colormapping**
- **Inversion:** The logic assumes `0.0` is the "signal" of interest in the raw output distance, so we invert it: `val = 1.0 - val`.
- **Jet Colormap:** A "Jet" gradient is applied:
    - **Red:** High Attention (Critical Region)
    - **Yellow/Green:** Medium Attention
    - **Blue/Transparent:** Low Attention (Background)

**C. Alpha Blending (Transparency)**
To ensure the underlying ECG trace remains visible:
- **Low Attention (Blue):** Set to fully transparent (`alpha = 0`).
- **High Attention (Red):** Set to semi-transparent (`alpha = 140/255`), creating a "glow" effect over the findings.

### 5. Upscaling & Overlay
The low-resolution grid is upscaled to match the original image size using **Bicubic Interpolation**. This smoothing creates a natural, cloud-like heat map rather than a blocky grid, which is then composited over the original ECG image.

## Interpretability Value
This system allows clinicians to verify *why* the AI made a diagnosis.
- **Example:** If the AI predicts "Anterior STEMI", the heatmap should glow Red specifically over the ST-segments in leads V3 and V4.
- **Safety:** If the AI predicts a condition but highlights an artifact or empty grid space, the clinician can immediately dismiss the result as a hallucination.
