
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { Worker } from "worker_threads";
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { startServer, chatCompletion, multimodalCompletion, stopServer } from './llama_server.js';
import { database } from './database.js';

const require = createRequire(import.meta.url);

// --- Workers ---
let visionWorker = null;
let ragWorker = null;

// Helper to wrap worker messages in Promise
function runVisionTask(type, data = {}) {
    return new Promise((resolve, reject) => {
        if (!visionWorker) return reject(new Error("Vision Worker not initialized"));
        const handler = (msg) => {
            if (msg.type === 'error') { visionWorker.off('message', handler); reject(new Error(msg.error)); }
            else if (msg.type === 'result' && type === 'analyze') { visionWorker.off('message', handler); resolve(msg); }
            else if (msg.type === 'init_success' && type === 'init') { visionWorker.off('message', handler); resolve(msg); }
        };
        visionWorker.on('message', handler);
        visionWorker.postMessage({ type, ...data });
    });
}

function runRagTask(type, data = {}) {
    return new Promise((resolve, reject) => {
        if (!ragWorker) return reject(new Error("RAG Worker not initialized"));
        const handler = (msg) => {
            if (msg.type === 'error') { ragWorker.off('message', handler); reject(new Error(msg.error)); }
            else if (msg.type === 'result' && type === 'retrieve') { ragWorker.off('message', handler); resolve(msg); }
            else if (msg.type === 'init_success' && type === 'init') { ragWorker.off('message', handler); resolve(msg); }
        };
        ragWorker.on('message', handler);
        ragWorker.postMessage({ type, ...data });
    });
}

export async function initializeAI(onProgress, modelsDir) {
    if (!modelsDir) throw new Error("modelsDir is required for initializeAI");

    if (onProgress) onProgress("Starting AI Initialization...", 10);

    // Read GPU layers config from DB, default to 10
    const gpuLayers = database.getSetting('gpu_layers') || '10';

    // 1. Start llama-server with multimodal support
    if (onProgress) onProgress(`Starting llama-server (GPU Layers: ${gpuLayers})...`, 20);
    console.log(`Starting llama-server subprocess with ${gpuLayers} GPU layers...`);

    await startServer(modelsDir, gpuLayers, (msg) => {
        // Forward server logs as progress
        if (msg.includes('model loaded') || msg.includes('loaded successfully')) {
            if (onProgress) onProgress("Model loaded in server", 60);
        }
    });
    console.log("llama-server is ready.");
    if (onProgress) onProgress("llama-server ready", 65);

    // 2. Initialize Vision Worker (for heatmap generation)
    if (!visionWorker) {
        console.log("Initializing Vision Worker...");
        if (onProgress) onProgress("Loading Vision Encoder...", 70);
        visionWorker = new Worker(path.join(__dirname, "vision_worker.mjs"));
        const onnxPath = path.join(modelsDir, "vision_encoder_quant.onnx");
        const heatmapDir = path.join(path.dirname(modelsDir), 'heatmaps');
        await fs.ensureDir(heatmapDir);
        await runVisionTask('init', { onnxPath, outputDir: heatmapDir });
        console.log("Vision Worker Ready.");
    }

    // 3. Initialize RAG Worker
    if (!ragWorker) {
        console.log("Initializing RAG Worker...");
        if (onProgress) onProgress("Loading Embeddings...", 85);
        ragWorker = new Worker(path.join(__dirname, "rag_worker.js"));
        await runRagTask('init');
        console.log("RAG Worker Ready.");
    }

    if (onProgress) onProgress("AI System Ready", 100);
}

// --- Agent State Definition ---
const GraphState = Annotation.Root({
    messages: Annotation({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    ecgFindings: Annotation({
        reducer: (x, y) => y,
        default: () => "No ECG data provided.",
    }),
    ecgPath: Annotation({
        reducer: (x, y) => y,
        default: () => null,
    }),
    reportFindings: Annotation({
        reducer: (x, y) => y,
        default: () => "No Medical Report provided.",
    }),
    heatmapPath: Annotation({
        reducer: (x, y) => y,
        default: () => null,
    }),
    clinicalAssessment: Annotation({
        reducer: (x, y) => y,
        default: () => "Assessment pending.",
    }),
    nextSteps: Annotation({
        reducer: (x, y) => y,
        default: () => [],
    }),
    lifestyleRecommendations: Annotation({
        reducer: (x, y) => y,
        default: () => [],
    })
});

// --- Nodes ---

async function entryNode(state) {
    return {};
}

async function chatNode(state) {
    const query = state.messages[state.messages.length - 1].content;
    const response = await chatCompletion([
        { role: "user", content: query }
    ]);
    return { messages: [new AIMessage({ content: response })] };
}

async function prepareDataNode(state) {
    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage.content;
    const userQuery = content;

    let updates = {};
    const tasks = [];

    // Extract ECG Path
    const ecgMatch = content.match(/\[ECG: (.*?)\]/);
    if (ecgMatch) {
        tasks.push((async () => {
            const ecgPath = ecgMatch[1];
            console.log("Processing ECG (Worker):", ecgPath);
            try {
                const result = await runVisionTask('analyze', { imagePath: ecgPath });
                updates.ecgFindings = "ECG image analyzed by vision encoder.";
                updates.heatmapPath = result.heatmap;
                updates.ecgPath = ecgPath;
            } catch (e) {
                console.error("ECG Worker Error:", e);
                updates.ecgFindings = "Error analyzing ECG: " + e.message;
                updates.ecgPath = ecgPath;
            }
        })());
    } else {
        updates.ecgFindings = "No ECG provided.";
    }

    // Extract PDF Path
    const pdfMatch = content.match(/\[Report: (.*?)\]/);
    if (pdfMatch) {
        tasks.push((async () => {
            const pdfPath = pdfMatch[1];
            console.log(`Reading PDF: ${pdfPath}`);
            try {
                const data = new Uint8Array(fs.readFileSync(pdfPath));
                const fontDir = path.join(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'), '../standard_fonts/');
                const fontPath = fontDir.split(path.sep).join('/') + '/';

                const loadingTask = pdfjsLib.getDocument({
                    data: data,
                    standardFontDataUrl: fontPath
                });

                const doc = await loadingTask.promise;
                let fullText = "";
                for (let i = 1; i <= doc.numPages; i++) {
                    const page = await doc.getPage(i);
                    const textContent = await page.getTextContent();
                    fullText += textContent.items.map(item => item.str).join(" ") + "\n";
                }

                console.log(`PDF Text Extracted. Length: ${fullText.length}`);
                console.log("Requesting RAG Context from Worker...");
                const result = await runRagTask('retrieve', { text: fullText, query: userQuery });
                console.log("RAG Context Received:", result.context.length, "chars");

                updates.reportFindings = result.context;
            } catch (error) {
                console.error("PDF/RAG Processing Error:", error);
                updates.reportFindings = "Error analyzing PDF.";
            }
        })());
    } else {
        updates.reportFindings = "No Medical Report provided.";
    }

    await Promise.all(tasks);
    return updates;
}

async function synthesisNode(state) {
    const pdfData = state.reportFindings;
    const ecgPath = state.ecgPath;

    console.log("Generating Assessment via llama-server...");
    console.log(`[SynthesisNode] reportFindings: "${pdfData ? pdfData.substring(0, 200) : 'NONE'}..."`);
    console.log(`[SynthesisNode] ecgPath: ${ecgPath || 'NONE'}`);

    // Fetch generation settings from DB
    const temp = parseFloat(database.getSetting('model_temp') || '0.1');
    const repeat = parseFloat(database.getSetting('model_repeat') || '1.3');
    const maxTokens = parseInt(database.getSetting('model_tokens') || '1024', 10);

    const hasReport = pdfData && pdfData !== "No Medical Report provided.";

    try {
        let response;

        if (ecgPath && await fs.pathExists(ecgPath)) {
            console.log("Encoding ECG image for multimodal inference...");
            const imageBuffer = await fs.readFile(ecgPath);
            const base64Image = imageBuffer.toString('base64');
            const ext = path.extname(ecgPath).toLowerCase();
            const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
            console.log(`Image encoded: ${(base64Image.length / 1024).toFixed(1)} KB base64`);

            let textPrompt;

            if (hasReport) {
                // Combined ECG + Blood Report prompt
                textPrompt = `You are an expert cardiologist performing a COMBINED analysis of:
1. A 12-lead ECG image (attached)
2. A patient's blood/lab report (provided below)

You MUST produce an INTEGRATED clinical report that correlates BOTH the ECG findings AND the lab results together. Use the following sections:

## 1. ECG Analysis
Analyze the ECG image: rhythm, rate, intervals (PR, QRS, QT), axis, ST-T wave changes.

## 2. Lab Report Findings
Summarize the key lab values from the blood report below. Highlight any abnormal values (e.g., elevated troponin, abnormal electrolytes, anemia, thyroid dysfunction, high BNP).

## 3. Combined Clinical Assessment
This is the MOST IMPORTANT section. Correlate the ECG findings with the lab values to produce a unified diagnosis. For example:
- If the ECG shows arrhythmia AND labs show electrolyte imbalance (low potassium/magnesium), note the correlation.
- If the ECG shows ST changes AND troponin is elevated, flag acute coronary syndrome risk.
- If labs show anemia AND ECG shows tachycardia, note compensatory response.
- If thyroid labs are abnormal AND ECG shows rate changes, correlate.

## 4. Risk Assessment & Next Steps
Based on BOTH ECG and lab findings together, recommend next steps.

## 5. Lifestyle Recommendations
Diet, exercise, and lifestyle modifications based on the combined findings.

IMPORTANT: Do NOT analyze the ECG in isolation. You MUST reference specific lab values in your diagnosis. If the labs are normal, explicitly state that the normal lab values rule out certain conditions suggested by the ECG.

=== PATIENT LAB REPORT ===
${pdfData}
=== END LAB REPORT ===`;
            } else {
                // ECG-only prompt
                textPrompt = `You are an expert cardiologist analyzing a 12-lead ECG image. Produce a concise, accurate clinical report with these sections:
1. Rhythm Analysis
2. Rate Assessment  
3. Interval Measurements (PR, QRS, QT)
4. Axis Evaluation
5. ST-T Wave Changes
6. Final Diagnosis

IMPORTANT: Only report abnormalities you can clearly identify in the image. If the ECG appears normal, state 'Normal sinus rhythm' and note the absence of pathology. Do not speculate about conditions not visible in the tracing.`;
            }

            const messages = [{
                role: "user",
                content: [
                    {
                        type: "image_url",
                        image_url: { url: `data:${mimeType};base64,${base64Image}` }
                    },
                    {
                        type: "text",
                        text: textPrompt
                    }
                ]
            }];

            console.log("Sending multimodal request to llama-server...");
            response = await chatCompletion(messages, {
                maxTokens: maxTokens,
                temperature: temp,
                topP: 0.9,
                repeatPenalty: repeat
            });
        } else {
            // Text-only fallback (PDF only, no ECG)
            let prompt = "Based on the provided clinical data, produce a detailed diagnostic assessment.";
            if (hasReport) {
                prompt += `\n\nClinical Context from Medical Report:\n${pdfData}`;
            }
            response = await chatCompletion([{ role: "user", content: prompt }], {
                maxTokens: maxTokens,
                temperature: temp,
                repeatPenalty: 1.3
            });
        }

        console.log("Response received. Length:", response.length);

        // Parse the response into sections
        let assessment = response.trim();
        let nextSteps = [];
        let lifestyle = [];

        const sentences = assessment.split(/(?<=\.)\s+/);
        let currentSection = "assessment";
        let assessmentText = [];

        for (const sentence of sentences) {
            const lower = sentence.toLowerCase();
            if (lower.includes("recommend") || lower.includes("next step") || lower.includes("further evaluation") || lower.includes("referral")) {
                currentSection = "nextSteps";
            }

            if (currentSection === "assessment") {
                assessmentText.push(sentence);
            } else {
                if (lower.includes("diet") || lower.includes("smoke") || lower.includes("exercise") || lower.includes("lifestyle")) {
                    lifestyle.push("• " + sentence);
                } else {
                    nextSteps.push("• " + sentence);
                }
            }
        }

        return {
            ecgFindings: assessment,
            clinicalAssessment: assessment,
            nextSteps: nextSteps.length > 0 ? nextSteps : ["Please review the assessment above for specific steps."],
            lifestyleRecommendations: lifestyle.length > 0 ? lifestyle : ["Maintain heart-healthy habits; consult physician for specifics."],
            messages: [new AIMessage({ content: "Analysis Complete" })]
        };

    } catch (e) {
        console.error("Synthesis Error:", e);
        return {
            clinicalAssessment: "Error generating assessment: " + e.message,
            messages: [new AIMessage({ content: "Error" })]
        };
    }
}

// --- Routing Logic ---
function routeRequest(state) {
    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage.content;
    const hasECG = content.includes("[ECG:");
    const hasPDF = content.includes("[Report:");

    if (hasECG || hasPDF) return "prepareDataNode";
    return "chat";
}

// --- Graph Construction ---
const workflow = new StateGraph(GraphState)
    .addNode("router", entryNode)
    .addNode("chat", chatNode)
    .addNode("prepareDataNode", prepareDataNode)
    .addNode("synthesisNode", synthesisNode)
    .addEdge(START, "router")
    .addConditionalEdges("router", routeRequest, ["chat", "prepareDataNode"])
    .addEdge("prepareDataNode", "synthesisNode")
    .addEdge("synthesisNode", END)
    .addEdge("chat", END);

export const appAgent = workflow.compile();
export { stopServer };
