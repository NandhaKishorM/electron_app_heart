import { parentPort } from 'worker_threads';
import * as onnx from 'onnxruntime-node';
import { Jimp } from 'jimp';
import path from 'path';
import fs from 'fs-extra';

let ONNX_PATH = null;
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
            // Signal (0.0) -> 1.0 (High Attention)
            val = 1.0 - val;

            // Invert the colormap as requested: Red becomes Blue, Blue becomes Red
            // High attention (val = 1.0) will use colorMapJet(0.0) = BLUE
            const rgb = colorMapJet(1.0 - val);

            // Alpha logic to hide the background properly but keep signals vibrant
            let alpha = 0;
            if (val > 0.2) {
                // Boost opacity significantly for visualization
                alpha = Math.floor(100 + val * 155);
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

// --- Vision Feature Extraction ---
function extractVisionDescription(outputMap) {
    const keys = Object.keys(outputMap);
    console.log(`[Worker] ONNX output keys: ${keys.join(', ')}`);
    keys.forEach(key => {
        const t = outputMap[key];
        console.log(`[Worker]   ${key}: dims=${JSON.stringify(t.dims)}, type=${t.type}`);
    });

    // --- Identify tensors by name or fallback by shape ---
    let embeddingsTensor = null; // projected_embeddings [1, N, D]
    let attentionTensor = null;  // attention_scores [1, N]
    let pooledTensor = null;     // pooled_embedding [1, D]

    for (const key of keys) {
        const t = outputMap[key];
        if (key.includes('projected') || key.includes('embedding')) {
            if (t.dims.length === 3) embeddingsTensor = t;
            else if (t.dims.length === 2 && !key.includes('attention')) pooledTensor = t;
        }
        if (key.includes('attention') || key.includes('att')) {
            attentionTensor = t;
        }
        if (key.includes('pooled')) {
            pooledTensor = t;
        }
    }

    // Fallback assignment by index if names didn't match
    if (!embeddingsTensor && keys.length >= 1) {
        const t = outputMap[keys[0]];
        if (t.dims.length === 3) embeddingsTensor = t;
    }
    if (!attentionTensor && keys.length >= 2) attentionTensor = outputMap[keys[1]];
    if (!pooledTensor && keys.length >= 3) pooledTensor = outputMap[keys[2]];

    const sections = [];

    // --- 1. Pooled Embedding Analysis (Global Image Summary) ---
    if (pooledTensor) {
        const data = pooledTensor.data;
        let sum = 0, sumSq = 0, min = Infinity, max = -Infinity;
        let posCount = 0, negCount = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i];
            sumSq += data[i] * data[i];
            if (data[i] < min) min = data[i];
            if (data[i] > max) max = data[i];
            if (data[i] > 0) posCount++;
            else negCount++;
        }
        const mean = sum / data.length;
        const std = Math.sqrt(sumSq / data.length - mean * mean);
        const energy = Math.sqrt(sumSq);
        sections.push(`Global Feature Vector: dim=${data.length}, mean=${mean.toFixed(4)}, std=${std.toFixed(4)}, energy=${energy.toFixed(2)}, range=[${min.toFixed(4)}, ${max.toFixed(4)}], positive_ratio=${(posCount / data.length * 100).toFixed(1)}%`);
    }

    // --- 2. Attention Score Analysis (Where the model focuses) ---
    if (attentionTensor) {
        const data = attentionTensor.data;
        const numPatches = data.length;
        const gridSize = Math.floor(Math.sqrt(numPatches));

        // Basic stats
        let sum = 0, min = Infinity, max = -Infinity;
        for (let i = 0; i < data.length; i++) {
            sum += data[i];
            if (data[i] < min) min = data[i];
            if (data[i] > max) max = data[i];
        }
        const meanAtt = sum / data.length;

        // Normalize and find high-attention patches
        const threshold = meanAtt + (max - meanAtt) * 0.5;
        const highAttPatches = [];
        for (let i = 0; i < data.length; i++) {
            if (data[i] >= threshold) {
                const row = Math.floor(i / gridSize);
                const col = i % gridSize;
                const normalizedVal = (max > min) ? (data[i] - min) / (max - min) : 0;
                highAttPatches.push({ idx: i, row, col, val: normalizedVal });
            }
        }
        highAttPatches.sort((a, b) => b.val - a.val);

        // Map grid regions to ECG lead approximate positions
        // In a standard 12-lead ECG printout (4 columns x 3 rows):
        // Top-left: I, aVR, V1, V4  |  Various lead arrangements
        function regionLabel(row, col, gridSize) {
            const rFrac = row / gridSize;
            const cFrac = col / gridSize;
            const regions = [];
            if (rFrac < 0.33) regions.push('upper');
            else if (rFrac < 0.66) regions.push('middle');
            else regions.push('lower');
            if (cFrac < 0.25) regions.push('left(leads-I/aVR)');
            else if (cFrac < 0.5) regions.push('center-left(leads-II/aVL)');
            else if (cFrac < 0.75) regions.push('center-right(leads-V1-V3)');
            else regions.push('right(leads-V4-V6)');
            return regions.join('-');
        }

        const topK = highAttPatches.slice(0, 8);
        const regionCounts = {};
        for (const p of topK) {
            const r = regionLabel(p.row, p.col, gridSize);
            regionCounts[r] = (regionCounts[r] || 0) + 1;
        }

        const highAttRatio = (highAttPatches.length / numPatches * 100).toFixed(1);
        sections.push(`Attention Distribution: ${highAttRatio}% of patches show high activation (${highAttPatches.length}/${numPatches} patches above threshold)`);

        if (topK.length > 0) {
            const regionStr = Object.entries(regionCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([region, count]) => `${region}(${count} patches)`)
                .join(', ');
            sections.push(`High-Attention Regions: ${regionStr}`);

            const topPatchStr = topK.slice(0, 5)
                .map(p => `grid[${p.row},${p.col}] intensity=${p.val.toFixed(3)}`)
                .join('; ');
            sections.push(`Top Focus Patches: ${topPatchStr}`);
        }

        // Quadrant energy distribution
        const quadrants = [0, 0, 0, 0]; // TL, TR, BL, BR
        for (let i = 0; i < data.length; i++) {
            const row = Math.floor(i / gridSize);
            const col = i % gridSize;
            const qIdx = (row < gridSize / 2 ? 0 : 2) + (col < gridSize / 2 ? 0 : 1);
            quadrants[qIdx] += (max > min) ? (data[i] - min) / (max - min) : 0;
        }
        const qTotal = quadrants.reduce((a, b) => a + b, 0) || 1;
        sections.push(`Spatial Energy: upper-left=${(quadrants[0] / qTotal * 100).toFixed(1)}%, upper-right=${(quadrants[1] / qTotal * 100).toFixed(1)}%, lower-left=${(quadrants[2] / qTotal * 100).toFixed(1)}%, lower-right=${(quadrants[3] / qTotal * 100).toFixed(1)}%`);
    }

    // --- 3. Embedding Patch Analysis (Feature richness per region) ---
    if (embeddingsTensor) {
        const dims = embeddingsTensor.dims; // [1, N, D]
        const N = dims[1]; // number of patches
        const D = dims[2]; // embedding dimension
        const data = embeddingsTensor.data;
        const gridSize = Math.floor(Math.sqrt(N));

        // Compute L2 norm per patch
        const norms = [];
        for (let p = 0; p < N; p++) {
            let sumSq = 0;
            for (let d = 0; d < D; d++) {
                const val = data[p * D + d];
                sumSq += val * val;
            }
            norms.push(Math.sqrt(sumSq));
        }

        let normMin = Infinity, normMax = -Infinity, normSum = 0;
        for (const n of norms) {
            if (n < normMin) normMin = n;
            if (n > normMax) normMax = n;
            normSum += n;
        }
        const normMean = normSum / norms.length;

        // Find patches with unusually high/low norms (potential anomaly indicators)
        const normStdDev = Math.sqrt(norms.reduce((s, n) => s + (n - normMean) ** 2, 0) / norms.length);
        const anomalyPatches = norms
            .map((n, i) => ({ idx: i, norm: n, zScore: (n - normMean) / (normStdDev + 1e-8) }))
            .filter(p => Math.abs(p.zScore) > 1.5)
            .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

        sections.push(`Embedding Norms: mean=${normMean.toFixed(3)}, std=${normStdDev.toFixed(3)}, range=[${normMin.toFixed(3)}, ${normMax.toFixed(3)}], dim=${D}`);

        if (anomalyPatches.length > 0) {
            const anomStr = anomalyPatches.slice(0, 5).map(p => {
                const row = Math.floor(p.idx / gridSize);
                const col = p.idx % gridSize;
                return `grid[${row},${col}] norm=${p.norm.toFixed(3)} z=${p.zScore.toFixed(2)}`;
            }).join('; ');
            sections.push(`Feature Anomaly Patches (|z|>1.5): ${anomStr}`);
            sections.push(`Anomaly Count: ${anomalyPatches.length}/${N} patches (${(anomalyPatches.length / N * 100).toFixed(1)}%) show unusual feature activation`);
        }
    }

    if (sections.length === 0) {
        return 'Vision encoder produced no analyzable outputs.';
    }

    return '[Vision Encoder ECG Analysis]\n' + sections.join('\n');
}

// --- Main Handler ---
let outputDir = null;

parentPort.on('message', async (msg) => {
    if (msg.type === 'init') {
        try {
            outputDir = msg.outputDir; // Receive Output Dir
            if (msg.onnxPath) ONNX_PATH = msg.onnxPath; // Receive ONNX path from main thread
            if (!ONNX_PATH) throw new Error("ONNX path not provided");
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

            // Extract vision description for LLM
            const visionDescription = extractVisionDescription(output);
            console.log(`[Worker] Vision Description:\n${visionDescription}`);

            parentPort.postMessage({
                type: 'result',
                heatmap: heatmapPath,
                visionDescription: visionDescription
            });

        } catch (e) {
            console.error(`[Worker Error] Failed to process ECG: ${e.message}`);
            parentPort.postMessage({ type: 'error', error: e.message });
        }
    }
});
