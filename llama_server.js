/**
 * llama-server subprocess manager.
 * Spawns llama-server.exe with multimodal support (--mmproj) and provides
 * an HTTP API client for chat completions.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import http from 'http';
import os from 'os';

const SERVER_PORT = 8847;
const SERVER_HOST = '127.0.0.1';
const HEALTH_POLL_INTERVAL = 1000; // ms
const HEALTH_TIMEOUT = 120000; // 2 minutes max wait for model load

let serverProcess = null;
let serverReady = false;

/**
 * Start the llama-server subprocess with multimodal support.
 * @param {string} modelsDir - Path to the directory containing model files
 * @param {function} onLog - Callback for server log messages
 * @returns {Promise<void>}
 */
export async function startServer(modelsDir, onLog) {
    if (serverProcess) {
        console.log('[LlamaServer] Server already running.');
        return;
    }

    const serverExe = path.join(modelsDir, 'llama-server.exe');
    const modelPath = path.join(modelsDir, 'ggml-model-q4_k_m.gguf');
    const mmprojPath = path.join(modelsDir, 'mmproj-medgemma-4b-ecginstruct-F16.gguf');

    // Verify files exist
    if (!await fs.pathExists(serverExe)) {
        throw new Error(`llama-server.exe not found at: ${serverExe}`);
    }
    if (!await fs.pathExists(modelPath)) {
        throw new Error(`Model GGUF not found at: ${modelPath}`);
    }

    const args = [
        '--model', modelPath,
        '--port', String(SERVER_PORT),
        '--host', SERVER_HOST,
        '--ctx-size', '4096',
        '--n-predict', '1024',
        '--threads', String(Math.max(1, Math.floor(os.cpus().length / 2))),
        '--n-gpu-layers', '10', // Set higher (e.g. 999) if your GPU has enough VRAM
    ];

    // Add mmproj if available (enables multimodal)
    if (await fs.pathExists(mmprojPath)) {
        args.push('--mmproj', mmprojPath);
        console.log('[LlamaServer] Multimodal mode enabled with mmproj.');
    } else {
        console.warn('[LlamaServer] mmproj not found. Running text-only mode.');
    }

    console.log(`[LlamaServer] Starting: ${serverExe} ${args.join(' ')}`);

    serverProcess = spawn(serverExe, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });

    serverProcess.stdout.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) {
            console.log(`[LlamaServer] ${msg}`);
            if (onLog) onLog(msg);
        }
    });

    serverProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) {
            console.log(`[LlamaServer:err] ${msg}`);
            if (onLog) onLog(msg);
        }
    });

    serverProcess.on('exit', (code, signal) => {
        console.log(`[LlamaServer] Process exited with code=${code}, signal=${signal}`);
        serverProcess = null;
        serverReady = false;
    });

    serverProcess.on('error', (err) => {
        console.error(`[LlamaServer] Process error: ${err.message}`);
        serverProcess = null;
        serverReady = false;
    });

    // Wait for server to become healthy
    await waitForHealth();
    serverReady = true;
    console.log('[LlamaServer] Server is ready and healthy.');
}

/**
 * Poll the /health endpoint until the server is ready.
 */
function waitForHealth() {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const poll = () => {
            if (Date.now() - startTime > HEALTH_TIMEOUT) {
                return reject(new Error('llama-server health check timed out after ' + HEALTH_TIMEOUT + 'ms'));
            }

            const req = http.get(`http://${SERVER_HOST}:${SERVER_PORT}/health`, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        if (data.status === 'ok' || data.status === 'no slot available') {
                            resolve();
                        } else if (data.status === 'loading model') {
                            console.log('[LlamaServer] Model loading...');
                            setTimeout(poll, HEALTH_POLL_INTERVAL);
                        } else {
                            setTimeout(poll, HEALTH_POLL_INTERVAL);
                        }
                    } catch {
                        setTimeout(poll, HEALTH_POLL_INTERVAL);
                    }
                });
            });

            req.on('error', () => {
                // Server not up yet, retry
                setTimeout(poll, HEALTH_POLL_INTERVAL);
            });

            req.end();
        };

        // Give it a small initial delay
        setTimeout(poll, 500);
    });
}


/**
 * Send a chat completion request to the llama-server.
 * Supports both text-only and multimodal messages (image_url content).
 *
 * @param {Array} messages - OpenAI-compatible messages array
 * @param {Object} options - Generation options
 * @returns {Promise<string>} - The assistant's response text
 */
export function chatCompletion(messages, options = {}) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            messages: messages,
            max_tokens: options.maxTokens || 1024,
            temperature: options.temperature || 0.1,
            top_p: options.topP || 0.9,
            repeat_penalty: options.repeatPenalty || 1.3,
            stop: ["<end_of_turn>", "<eos>", "\n\n\n"],
            stream: false
        });

        const req = http.request({
            hostname: SERVER_HOST,
            port: SERVER_PORT,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
            timeout: 300000, // 5 minute timeout for generation
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (data.error) {
                        reject(new Error(`LlamaServer API error: ${data.error.message || JSON.stringify(data.error)}`));
                        return;
                    }
                    if (data.choices && data.choices.length > 0) {
                        resolve(data.choices[0].message.content);
                    } else {
                        reject(new Error('No choices in response: ' + body));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${e.message}. Body: ${body.substring(0, 500)}`));
                }
            });
        });

        req.on('error', (err) => {
            reject(new Error(`HTTP request failed: ${err.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Chat completion request timed out'));
        });

        req.write(payload);
        req.end();
    });
}

/**
 * Send a multimodal completion request using /completion endpoint.
 * Uses [img-N] tags and image_data array (llama.cpp b7836 format).
 *
 * @param {string} prompt - Text prompt with [img-N] placeholders
 * @param {Array} imageData - Array of { data: base64string, id: N }
 * @param {Object} options - Generation options
 * @returns {Promise<string>} - The generated text
 */
export function multimodalCompletion(prompt, imageData = [], options = {}) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            prompt: prompt,
            image_data: imageData,
            n_predict: options.maxTokens || 1024,
            temperature: options.temperature || 0.1,
            top_p: options.topP || 0.9,
            repeat_penalty: options.repeatPenalty || 1.2,
            stream: false
        });

        const req = http.request({
            hostname: SERVER_HOST,
            port: SERVER_PORT,
            path: '/completion',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
            timeout: 300000,
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (data.error) {
                        reject(new Error(`LlamaServer API error: ${JSON.stringify(data.error)}`));
                        return;
                    }
                    resolve(data.content || '');
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${e.message}. Body: ${body.substring(0, 500)}`));
                }
            });
        });

        req.on('error', (err) => {
            reject(new Error(`HTTP request failed: ${err.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Multimodal completion request timed out'));
        });

        req.write(payload);
        req.end();
    });
}

/**
 * Stop the llama-server subprocess.
 */
export function stopServer() {
    if (serverProcess) {
        console.log('[LlamaServer] Stopping server...');
        serverProcess.kill('SIGTERM');
        // Force kill after 5 seconds if still alive
        const forceKillTimer = setTimeout(() => {
            if (serverProcess) {
                console.log('[LlamaServer] Force killing server...');
                serverProcess.kill('SIGKILL');
            }
        }, 5000);

        serverProcess.on('exit', () => {
            clearTimeout(forceKillTimer);
        });

        serverProcess = null;
        serverReady = false;
    }
}

/**
 * Check if the server is running and ready.
 */
export function isServerReady() {
    return serverReady && serverProcess !== null;
}
