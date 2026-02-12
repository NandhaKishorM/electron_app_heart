import { parentPort } from 'worker_threads';
import * as onnx from 'onnxruntime-node';
import { Jimp } from 'jimp';
import path from 'path';
import fs from 'fs-extra';

const ONNX_PATH = path.join(process.cwd(), "onnx_export", "vision_encoder_quant.onnx");
let visionSession = null;

// --- Helper: Jet Colormap ---
function colorMapJet(value) {
    let r, g, b;
    const v = Math.max(0, Math.min(1, value));

    if (v < 0.25) {
        // Blue to Cyan
        r = 0;
        g = 4 * v * 255;
        b = 255;
    } else if (v < 0.5) {
        // Cyan to Green
        r = 0;
        g = 255;
        b = 255 - 4 * (v - 0.25) * 255;
    } else if (v < 0.75) {
        // Green to Yellow
        r = 4 * (v - 0.5) * 255;
        g = 255;
        b = 0;
    } else {
        // Yellow to Red
        r = 255;
        g = 255 - 4 * (v - 0.75) * 255;
        b = 0;
    }
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

function rgbaToInt(r, g, b, a) {
    return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

// --- Image Preprocessing ---
async function preprocessImage(imagePath) {
    const image = await Jimp.read(imagePath);
    const targetSize = 896;
    // Resize with bilinear for input
    const resized = image.resize({ w: targetSize, h: targetSize });

    // ... Tensor creation logic ...
    const float32Data = new Float32Array(1 * 3 * targetSize * targetSize);
    const { width, height } = resized.bitmap;
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];

    resized.scan(0, 0, width, height, (x, y, idx) => {
        const r = resized.bitmap.data[idx] / 255.0;
        const g = resized.bitmap.data[idx + 1] / 255.0;
        const b = resized.bitmap.data[idx + 2] / 255.0;
        const normR = (r - mean[0]) / std[0];
        const normG = (g - mean[1]) / std[1];
        const normB = (b - mean[2]) / std[2];
        float32Data[0 * targetSize * targetSize + y * targetSize + x] = normR;
        float32Data[1 * targetSize * targetSize + y * targetSize + x] = normG;
        float32Data[2 * targetSize * targetSize + y * targetSize + x] = normB;
    });

    return new onnx.Tensor("float32", float32Data, [1, 3, targetSize, targetSize]);
}

async function generateHeatmapOverlay(imagePath, outputMap) {
    const original = await Jimp.read(imagePath);

    // Find attention tensor
    let attentionTensor = null;
    let keys = Object.keys(outputMap);
    for (const key of keys) {
        const tensor = outputMap[key];
        if (tensor.dims.length === 2 || tensor.dims.length === 3) {
            if (key.includes("attention") || key.includes("att")) {
                attentionTensor = tensor;
                break;
            }
        }
    }
    if (!attentionTensor && keys.length >= 2) attentionTensor = outputMap[keys[1]];

    if (!attentionTensor) return imagePath;

    const data = attentionTensor.data;
    const seqLen = data.length;
    const gridSize = Math.floor(Math.sqrt(seqLen));

    const heatmap = new Jimp({ width: gridSize, height: gridSize });

    const vmin = 0.3;
    const vmax = 0.7;

    let minVal = Infinity, maxVal = -Infinity;
    for (let i = 0; i < data.length; i++) {
        if (data[i] < minVal) minVal = data[i];
        if (data[i] > maxVal) maxVal = data[i];
    }

    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            const idx = y * gridSize + x;
            // Normalization: raw values are usually very small (softmax output)
            // We rely on the min/max found above to stretch them to 0-1.

            // Debug: Log range once per image
            if (x === 0 && y === 0) console.log(`[Worker] Heatmap Raw Range: ${minVal.toFixed(6)} to ${maxVal.toFixed(6)}`);

            // Standard Normalize (High = Attention)
            let val = data[idx];
            if (maxVal > minVal) val = (val - minVal) / (maxVal - minVal);

            // Logic from quantized_inference.py
            // vmin: 0.3 (Suppress background)
            // vmax: 0.7 (Boost faint signals)
            const vmin = 0.3;
            const vmax = 0.7;

            val = (val - vmin) / (vmax - vmin + 1e-8);

            // Clip to 0-1
            val = Math.max(0, Math.min(1, val));

            // Invert logic (Crucial: Model output needs to be inverted)
            // Grid (1.0) -> 0.0 (Transparent)
            // Signal (0.0) -> 1.0 (Red)
            val = 1.0 - val;

            const rgb = colorMapJet(val);

            // Alpha logic to match "Overlay" appearance
            // In Python script it blends with alpha=0.5. 
            // Here we set pixel alpha. 
            // We'll keep low values transparent to avoid "Blue Background"
            let alpha = 0;
            if (val > 0) {
                // 0.5 opacity = ~128
                alpha = 140;
            }

            // Optional: smooth alpha transition at edges
            // alpha = Math.floor(val * 160);

            heatmap.setPixelColor(rgbaToInt(rgb.r, rgb.g, rgb.b, alpha), x, y);
        }
    }

    // Upscale using Bicubic for smooth "cloud-like" attention map
    heatmap.resize({ w: original.bitmap.width, h: original.bitmap.height, mode: 'bicubicInterpolation' });
    // Composite with full opacity (since we handle alpha per pixel now)
    original.composite(heatmap, 0, 0, { opacity: 1.0 });

    // Use specific output dir if provided, else fallback to temp (or fail safely)
    const targetDir = outputDir || path.dirname(imagePath);
    const outputPath = path.join(targetDir, `heatmap_${Date.now()}.png`);

    await original.write(outputPath);
    return outputPath;
}

// --- Main Handler ---
let outputDir = null;

parentPort.on('message', async (msg) => {
    if (msg.type === 'init') {
        try {
            outputDir = msg.outputDir; // Receive Output Dir
            if (!visionSession) {
                visionSession = await onnx.InferenceSession.create(ONNX_PATH);
            }
            parentPort.postMessage({ type: 'init_success' });
        } catch (e) {
            parentPort.postMessage({ type: 'error', error: e.message });
        }
    } else if (msg.type === 'analyze') {
        try {
            if (!visionSession) throw new Error("Vision session not initialized");

            const imagePath = msg.imagePath;
            console.log(`Analyzing ECG (Worker): ${imagePath}`);

            const inputTensor = await preprocessImage(imagePath);

            const inputNames = visionSession.inputNames;
            const feeds = {};
            feeds[inputNames[0]] = inputTensor;

            const output = await visionSession.run(feeds);
            const heatmapPath = await generateHeatmapOverlay(imagePath, output);

            parentPort.postMessage({
                type: 'result',
                heatmap: heatmapPath
            });

        } catch (e) {
            console.error(`[Worker Error] Failed to process ECG: ${e.message}`);
            parentPort.postMessage({ type: 'error', error: e.message });
        }
    }
});
