
import https from 'https';
import http from 'http';
import fs from 'fs-extra';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// --- Model Definitions ---
const MODEL_FILES = [
    {
        name: 'ggml-model-q4_k_m.gguf',
        url: 'https://storage.googleapis.com/courseai/ggml-model-q4_k_m.gguf',
        expectedSize: 2489894464, // ~2.5 GB
        subDir: 'models'
    },
    {
        name: 'mmproj-medgemma-4b-ecginstruct-F16.gguf',
        url: 'https://storage.googleapis.com/courseai/mmproj-medgemma-4b-ecginstruct-F16.gguf',
        expectedSize: 851252064, // ~851 MB
        subDir: 'models'
    },
    {
        name: 'vision_encoder_quant.onnx',
        url: 'https://storage.googleapis.com/courseai/vision_encoder_quant.onnx',
        expectedSize: 422088402, // ~422 MB
        subDir: 'models'
    },
    {
        name: 'llama-server-b7836-win-vulkan-x64.zip',
        url: 'https://github.com/ggml-org/llama.cpp/releases/download/b7836/llama-b7836-bin-win-vulkan-x64.zip',
        expectedSize: 46673291, // ~46 MB (Vulkan, supports NVIDIA/AMD/Intel GPUs)
        subDir: 'models',
        isZip: true,
        extractAll: true // extract all .exe and .dll files
    }
];

/**
 * Download a single file with progress callback.
 * Follows HTTP redirects automatically.
 */
function downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        const protocol = url.startsWith('https') ? https : http;

        const request = protocol.get(url, (response) => {
            // Handle redirects (301, 302, 307, 308)
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                file.close();
                fs.removeSync(destPath);
                return downloadFile(response.headers.location, destPath, onProgress).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.removeSync(destPath);
                return reject(new Error(`Download failed: HTTP ${response.statusCode} for ${url}`));
            }

            const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
            let downloadedBytes = 0;

            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                if (onProgress && totalBytes > 0) {
                    const percent = Math.round((downloadedBytes / totalBytes) * 100);
                    const downloadedMB = (downloadedBytes / (1024 * 1024)).toFixed(1);
                    const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
                    onProgress({ downloadedBytes, totalBytes, percent, downloadedMB, totalMB });
                }
            });

            response.pipe(file);

            file.on('finish', () => {
                file.close(() => resolve(destPath));
            });
        });

        request.on('error', (err) => {
            file.close();
            fs.removeSync(destPath);
            reject(err);
        });

        file.on('error', (err) => {
            file.close();
            fs.removeSync(destPath);
            reject(err);
        });
    });
}

/**
 * Extract files from a zip archive.
 * If extractAll=true, extracts all .exe and .dll files (flattened to outputDir).
 */
async function extractFromZip(zipPath, outputDir, options = {}) {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    let extracted = 0;
    for (const entry of entries) {
        if (entry.isDirectory) continue;
        const name = path.basename(entry.entryName);
        if (name.endsWith('.exe') || name.endsWith('.dll')) {
            const outPath = path.join(outputDir, name);
            fs.writeFileSync(outPath, entry.getData());
            extracted++;
        }
    }
    console.log(`[Downloader] Extracted ${extracted} files from zip to ${outputDir}`);
}

/**
 * Ensure all model files are downloaded to the target directory.
 * Checks existence and file size; re-downloads if size mismatch (partial download).
 *
 * @param {string} modelsDir - Absolute path to the models directory (e.g. userData/models)
 * @param {function} onProgress - Callback: (status) where status = { type, fileName, percent, downloadedMB, totalMB, fileIndex, totalFiles }
 * @returns {Promise<string>} - The modelsDir path
 */
export async function ensureModelsDownloaded(modelsDir, onProgress) {
    await fs.ensureDir(modelsDir);

    const totalFiles = MODEL_FILES.length;

    for (let i = 0; i < MODEL_FILES.length; i++) {
        const model = MODEL_FILES[i];
        const filePath = path.join(modelsDir, model.name);

        // Check if file exists and has correct size
        let needsDownload = true;
        if (await fs.pathExists(filePath)) {
            const stats = await fs.stat(filePath);
            if (stats.size === model.expectedSize) {
                console.log(`[Downloader] ${model.name} already exists with correct size (${model.expectedSize} bytes). Skipping.`);
                needsDownload = false;

                if (onProgress) {
                    onProgress({
                        type: 'skip',
                        fileName: model.name,
                        percent: 100,
                        downloadedMB: (model.expectedSize / (1024 * 1024)).toFixed(1),
                        totalMB: (model.expectedSize / (1024 * 1024)).toFixed(1),
                        fileIndex: i + 1,
                        totalFiles
                    });
                }
            } else {
                console.log(`[Downloader] ${model.name} exists but size mismatch (got ${stats.size}, expected ${model.expectedSize}). Re-downloading...`);
                await fs.remove(filePath);
            }
        }

        if (needsDownload) {
            console.log(`[Downloader] Downloading ${model.name} from ${model.url}...`);

            if (onProgress) {
                onProgress({
                    type: 'start',
                    fileName: model.name,
                    percent: 0,
                    downloadedMB: '0',
                    totalMB: (model.expectedSize / (1024 * 1024)).toFixed(1),
                    fileIndex: i + 1,
                    totalFiles
                });
            }

            await downloadFile(model.url, filePath, (progress) => {
                if (onProgress) {
                    onProgress({
                        type: 'progress',
                        fileName: model.name,
                        percent: progress.percent,
                        downloadedMB: progress.downloadedMB,
                        totalMB: progress.totalMB,
                        fileIndex: i + 1,
                        totalFiles
                    });
                }
            });

            // Verify downloaded file size
            const downloadedStats = await fs.stat(filePath);
            if (downloadedStats.size !== model.expectedSize) {
                await fs.remove(filePath);
                throw new Error(
                    `${model.name} download verification failed: got ${downloadedStats.size} bytes, expected ${model.expectedSize} bytes`
                );
            }

            console.log(`[Downloader] ${model.name} downloaded and verified successfully.`);

            // Handle zip extraction if needed
            if (model.isZip && model.extractAll) {
                const serverExe = path.join(modelsDir, 'llama-server.exe');
                if (!await fs.pathExists(serverExe)) {
                    await extractFromZip(filePath, modelsDir);
                } else {
                    console.log(`[Downloader] llama-server.exe already extracted. Skipping.`);
                }
            }

            if (onProgress) {
                onProgress({
                    type: 'complete',
                    fileName: model.name,
                    percent: 100,
                    downloadedMB: (model.expectedSize / (1024 * 1024)).toFixed(1),
                    totalMB: (model.expectedSize / (1024 * 1024)).toFixed(1),
                    fileIndex: i + 1,
                    totalFiles
                });
            }
        }
    }

    return modelsDir;
}

/**
 * Get the paths for all model files given the models directory.
 */
export function getModelPaths(modelsDir) {
    return {
        modelPath: path.join(modelsDir, 'ggml-model-q4_k_m.gguf'),
        mmprojPath: path.join(modelsDir, 'mmproj-medgemma-4b-ecginstruct-F16.gguf'),
        onnxPath: path.join(modelsDir, 'vision_encoder_quant.onnx')
    };
}
