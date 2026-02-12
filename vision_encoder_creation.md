# Vision Encoder Creation & Quantization

## Overview
This document explains the process used to create the `vision_encoder_quant.onnx` model file used in the application. The process involves extracting the vision component from the full MedGemma-4B model, exporting it to ONNX format, and then applying dynamic quantization to reduce its size for edge deployment.

**Source Notebook:** `vision-tower-4545478bn.ipynb`

## Step 1: Model Loading & Extraction
We started by loading the fine-tuned MedGemma model:
- **Model ID:** `convaiinnovations/medgemma-4b-ecginstruct`
- **Precision:** FP16 (to preserve weight accuracy during load)
- **Components Extracted:**
    - `vision_tower`: The SigLIP-based vision backbone.
    - `multi_modal_projector`: The linear projection layer that maps vision embeddings to the LLM's token space.

## Step 2: Custom Wrapper
A custom `VisionEncoderWrapper` class was defined to bundle the feature extraction and projection logic into a single exportable graph.

**Key Operations in Wrapper:**
1.  **Forward Pass:** Image patches pass through the Vision Tower.
2.  **Pooling:** If the number of patches exceeds 256 (e.g., for high-res inputs), they are essentially pooled down to a fixed **16x16 grid** (256 tokens).
3.  **Projection:** The embeddings are multiplied by the projection weights.
4.  **Attention Calculation:**
    - The L2 norm of the projected embeddings is calculated.
    - Values are normalized (Min-Max scaling) to create "Attention Scores" representing the information density of each patch.

## Step 3: ONNX Export
The wrapper was exported using `torch.onnx.export` with the following configuration:
- **Opset Version:** 18
- **Input:** `pixel_values` (Batch, 3, Height, Width)
- **Outputs:**
    1.  `projected_embeddings`: For CMAS/RAG retrieval.
    2.  `attention_scores`: For Heatmap generation.
    3.  `pooled_embedding`: Global image vector.
- **Dynamic Axes:** Batch size is dynamic to allow processing single or multiple images.

**Intermediate Result:** `vision_encoder.onnx` (~600 MB)

## Step 4: Dynamic Quantization
To make the model suitable for a local Electron app (CPU inference), we applied **Dynamic Quantization** using `onnxruntime`.

```python
from onnxruntime.quantization import quantize_dynamic, QuantType

quantize_dynamic(
    model_input="vision_encoder.onnx",
    model_output="vision_encoder_quant.onnx",
    weight_type=QuantType.QUInt8  # Quantize weights to 8-bit Unsigned Integers
)
```

**Final Result:** `vision_encoder_quant.onnx` (~150 MB)
- **Size Reduction:** ~4x smaller.
- **Performance:** Optimized for CPU inference via ONNX Runtime.
