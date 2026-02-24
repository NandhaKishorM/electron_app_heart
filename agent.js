
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { ChatLlamaCpp } from "@langchain/community/chat_models/llama_cpp";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { getLlama, LlamaChatSession, LlamaJsonSchemaGrammar } from "node-llama-cpp";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { Worker } from "worker_threads";
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";


const require = createRequire(import.meta.url);

// Define Schema using Zod
const AssessmentSchema = z.object({
    ecg_findings: z.string().describe("Comprehensive narrative detailing all ECG findings, including rhythm, rate, intervals, axis, and specific ST-T wave changes. Explain the significance of each finding."),
    report_findings: z.string().describe("Detailed clinical report summary, listing all abnormal lab values with their units and reference ranges. explain the clinical implications of these abnormalities."),
    clinical_assessment: z.string().describe("A holistic and detailed clinical assessment connecting the ECG findings with the laboratory results. Discuss potential diagnoses, differential diagnoses, and the overall severity of the patient's condition. Do not just list findings; synthesize them."),
    next_steps: z.array(z.string()).min(1).describe("List of at least 3 specific and actionable next steps, including confirmatory tests, specialist referrals, and immediate interventions."),
    lifestyle_recommendations: z.array(z.string()).min(1).describe("List of at least 3 detailed lifestyle modifications, including specific dietary changes, activity restrictions, and symptom monitoring advice.")
});

// --- Configuration (set dynamically at init) ---
let MODEL_PATH = null;
let MMPROJ_PATH = null;

// --- Model Initialization (Singleton) ---
let llama = null;
let llamaModel = null;
let llamaContext = null;
let llamaSession = null;
// --- Worker Initialization ---
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

    // Set model paths from the provided models directory
    MODEL_PATH = path.join(modelsDir, "ggml-model-q4_k_m.gguf");
    MMPROJ_PATH = path.join(modelsDir, "mmproj-medgemma-4b-ecginstruct-F16.gguf");

    if (onProgress) onProgress("Starting AI Initialization...", 10);

    if (!llama) {
        console.log("Loading MedGemma Model...");
        try {
            llama = await getLlama();
            if (onProgress) onProgress("Loading Model File...", 30);

            // ATTEMPT MULTIMODAL LOAD
            console.log(`Checking for MMProj at: ${MMPROJ_PATH}`);
            const hasMMProj = await fs.pathExists(MMPROJ_PATH);

            if (hasMMProj) {
                console.log("Loading Multimodal Projector...");
                llamaModel = await llama.loadModel({
                    modelPath: MODEL_PATH,
                    // Speculative: passing visual options if supported by binding
                    visual: {
                        modelPath: MMPROJ_PATH
                    }
                });
            } else {
                console.warn("MMProj file not found. Loading text-only model.");
                llamaModel = await llama.loadModel({ modelPath: MODEL_PATH });
            }

            if (onProgress) onProgress("Creating Context...", 50);
            llamaContext = await llamaModel.createContext(); // Default context size
            if (onProgress) onProgress("Creating Session...", 70);
            llamaSession = new LlamaChatSession({ contextSequence: llamaContext.getSequence() });
            console.log("MedGemma Model Loaded.");
        } catch (err) {
            console.error("Failed to load MedGemma:", err);
            throw err;
        }
    }

    if (!visionWorker) {
        console.log("Initializing Vision Worker...");
        // Use the correct worker file
        visionWorker = new Worker(path.join(__dirname, "vision_worker.mjs"));
        const onnxPath = path.join(modelsDir, "vision_encoder_quant.onnx");
        await runVisionTask('init', { onnxPath });
        console.log("Vision Worker Ready.");
    }

    if (!ragWorker) {
        console.log("Initializing RAG Worker...");
        if (onProgress) onProgress("Loading Embeddings...", 80);
        ragWorker = new Worker(path.join(__dirname, "rag_worker.js"));
        await runRagTask('init'); // Pre-load embeddings in worker
        console.log("RAG Worker Ready.");
    }

    if (onProgress) onProgress("AI System Ready", 100);
}

// --- Nodes ---

// Agent State Definition
const GraphState = Annotation.Root({
    messages: Annotation({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    ecgFindings: Annotation({
        reducer: (x, y) => y,
        default: () => "No ECG data provided.",
    }),
    ecgPath: Annotation({ // Added ecgPath
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

async function entryNode(state) {
    return {};
}

async function chatNode(state) {
    const query = state.messages[state.messages.length - 1].content;
    const response = await llamaSession.prompt(query);
    return { messages: [new AIMessage({ content: response })] };
}

async function ecgNode(state) {
    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage.content;

    // Extract ECG Path
    const ecgMatch = content.match(/\[ECG: (.*?)\]/);
    if (!ecgMatch) return { ecgFindings: "No ECG provided." };

    const ecgPath = ecgMatch[1];
    console.log("Processing ECG (Worker):", ecgPath);

    try {
        const result = await runVisionTask('analyze', { imagePath: ecgPath });
        return {
            ecgFindings: result.description, // Direct mapping from Worker
            heatmapPath: result.heatmap, // Map 'heatmap' from worker to 'heatmapPath' in state
            ecgPath: ecgPath // Save path for synthesis node
        };
    } catch (e) {
        console.error("ECG Worker Error:", e);
        return { ecgFindings: "Error analyzing ECG: " + e.message };
    }
}

async function pdfNode(state) {
    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage.content;
    const userQuery = content;

    // Extract PDF Path
    const pdfMatch = content.match(/\[Report: (.*?)\]/);
    if (!pdfMatch) return { reportFindings: "No Medical Report provided." };

    const pdfPath = pdfMatch[1];
    try {
        console.log(`Reading PDF: ${pdfPath}`);
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

        return { reportFindings: result.context }; // Map to reportFindings

    } catch (error) {
        console.error("PDF/RAG Processing Error:", error);
        return { reportFindings: "Error analyzing PDF." };
    }
}

async function synthesisNode(state) {
    const pdfData = state.reportFindings;
    const ecgPath = state.ecgPath; // Get ECG Path
    const lastMessage = state.messages[state.messages.length - 1];
    let userQuery = lastMessage.content;

    // Sanitize the query to prevent filename bias
    // e.g. "Please analyze this patient case. [ECG: path/to/STEMI.jpg]" -> "Please analyze this patient case. [ECG Image Attached]"
    userQuery = userQuery.replace(/\[ECG: .*?\]/g, "[ECG Image Attached]");
    userQuery = userQuery.replace(/\[Report: .*?\]/g, "[Medical Report Attached]");

    const context = `
Clinical Report / Patient History (Context):
${pdfData}
    `.trim();

    // Use the EXACT prompt the model was fine-tuned on for best results
    let prompt = "<image>\nReview the ECG signal image and produce a detailed report on your diagnostic observations, ending with the final diagnosis.";

    // If PDF report data exists, append it to the end of the prompt safely
    if (pdfData && pdfData !== "No Medical Report provided.") {
        prompt += `\n\n[Clinical Context from Provided Medical Report]:\n${pdfData}`;
    }

    console.log("Generating Assessment using Fine-Tuned Prompt...");

    try {
        // Speculative Multimodal Prompting
        // We attempt to pass the image via options if supported
        const promptOptions = {
            maxTokens: 1024,
            temperature: 0.1,
            topP: 0.9,
            repeatPenalty: 1.2
        };

        if (ecgPath) {
            console.log("Passing Image to LLM (Speculative)...");
            // Some bindings use 'images' array in options
            promptOptions.images = [ecgPath];
        }

        const response = await llamaSession.prompt(prompt, promptOptions);

        console.log("Structured Text Generated. Parsing...");

        // Orchestrator Parsing Logic
        let assessment = "Assessment could not be parsed.";
        let nextSteps = [];
        let lifestyle = [];

        try {
            // Since we reverted to the strict training prompt, the model will output a narrative report
            // rather than strictly formatted headers. We use the full output as the primary assessment.
            assessment = response.trim();

            // Try to loosely extract "Next Steps" or "Recommendations" if the model happened to list them.
            // If not, we just present the raw report.
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
                    // Very rudimentary sorting
                    if (lower.includes("diet") || lower.includes("smoke") || lower.includes("exercise") || lower.includes("lifestyle")) {
                        lifestyle.push("• " + sentence);
                    } else {
                        nextSteps.push("• " + sentence);
                    }
                }
            }

            // We use the full text as the ECG findings / Assessment to not lose data
            let combinedAssessment = assessment;

            return {
                ecgFindings: combinedAssessment,
                clinicalAssessment: combinedAssessment,
                nextSteps: nextSteps.length > 0 ? nextSteps : ["Please review the assessment above for specific steps."],
                lifestyleRecommendations: lifestyle.length > 0 ? lifestyle : ["Maintain heart-healthy habits; consult physician for specifics."],
                messages: [new AIMessage({ content: "Analysis Complete" })]
            };

        } catch (parseError) {
            console.error("Parsing Error:", parseError);
            assessment = response; // Fallback to raw response
            return {
                clinicalAssessment: assessment,
                messages: [new AIMessage({ content: "Analysis Complete (Parse Error)" })]
            };
        }

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

    if (hasECG && hasPDF) return ["ecgNode", "pdfNode"];
    if (hasECG) return "ecgNode";
    if (hasPDF) return "pdfNode";
    return "chat";
}

// --- Graph Construction ---
const workflow = new StateGraph(GraphState)
    .addNode("router", entryNode)
    .addNode("chat", chatNode)
    .addNode("ecgNode", ecgNode)
    .addNode("pdfNode", pdfNode)
    .addNode("synthesisNode", synthesisNode)
    .addEdge(START, "router")
    .addConditionalEdges("router", routeRequest, ["chat", "ecgNode", "pdfNode"])
    .addEdge("ecgNode", "synthesisNode")
    .addEdge("pdfNode", "synthesisNode")
    .addEdge("synthesisNode", END)
    .addEdge("chat", END);

export const appAgent = workflow.compile();
