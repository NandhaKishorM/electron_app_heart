
import { app, BrowserWindow, ipcMain, protocol } from "electron";
import path from "path";
import fs from "fs-extra";
import { database } from "./database.js";
import { appAgent, initializeAI, stopServer } from "./agent.js";
import { ensureModelsDownloaded } from "./model_downloader.js";
import { fileURLToPath } from "url";

// Ensure heatmaps directory exists in User Data (Safe for Build/Dev)
const heatmapsDir = path.join(app.getPath('userData'), 'heatmaps');
const modelsDir = path.join(app.getPath('userData'), 'models');
fs.ensureDirSync(heatmapsDir);
fs.ensureDirSync(modelsDir);
console.log("Heatmap Output Dir:", heatmapsDir);
console.log("Models Dir:", modelsDir);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
let isAIReady = false;

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false // Allow loading local files (file:// protocol)
        },
        titleBarStyle: "hidden",
        titleBarOverlay: {
            color: "#0f172a",
            symbolColor: "#ffffff",
        },
        backgroundColor: "#0f172a",
        icon: path.join(__dirname, "assets/icon.png") // Placeholder
    });

    mainWindow.loadFile("index.html");
    // mainWindow.webContents.openDevTools(); // Uncomment for debugging
}

app.whenReady().then(async () => {
    createWindow();

    try {
        // 1. Download Models (if not already present)
        console.log("Checking/downloading models...");
        await ensureModelsDownloaded(modelsDir, (status) => {
            if (mainWindow) {
                mainWindow.webContents.send('ai-status', {
                    status: 'downloading',
                    message: `Downloading ${status.fileName}... ${status.downloadedMB} MB / ${status.totalMB} MB`,
                    percent: Math.round(((status.fileIndex - 1) / status.totalFiles) * 100 + (status.percent / status.totalFiles)),
                    fileName: status.fileName,
                    downloadedMB: status.downloadedMB,
                    totalMB: status.totalMB,
                    fileIndex: status.fileIndex,
                    totalFiles: status.totalFiles,
                    downloadPercent: status.percent
                });
            }
        });
        console.log("All models ready.");

        // 2. Initialize AI Models
        console.log("Initializing AI...");
        await initializeAI((msg, pct) => {
            if (mainWindow) mainWindow.webContents.send('ai-status', { status: 'loading', message: msg, percent: pct });
        }, modelsDir);
        console.log("AI Initialized. Notifying Window.");
        isAIReady = true;
        if (mainWindow) mainWindow.webContents.send('ai-status', { status: 'ready', percent: 100 });
    } catch (error) {
        console.error("Failed to initialize AI:", error);
        if (mainWindow) mainWindow.webContents.send('ai-status', { status: 'error', message: error.message });
    }

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // Clean shutdown of llama-server
    app.on('before-quit', () => {
        console.log('Stopping llama-server before quit...');
        stopServer();
    });
});

app.on("window-all-closed", () => {
    stopServer();
    if (process.platform !== "darwin") app.quit();
});

// --- IPC Handlers ---

ipcMain.handle("get-history", (event, options) => {
    return database.getSessions(options);
});

ipcMain.handle("get-messages", (event, sessionId) => {
    return database.getMessages(sessionId);
});

ipcMain.handle("create-session", (event, title) => {
    return database.createSession(title);
});

ipcMain.handle("get-settings", () => {
    return database.getAllSettings();
});

ipcMain.handle("save-setting", (event, { key, value }) => {
    return database.saveSetting(key, value);
});

ipcMain.handle("delete-session", (event, sessionId) => {
    return database.deleteSession(sessionId);
});

ipcMain.handle("clear-history", () => {
    return database.clearAll();
});

ipcMain.handle("get-session", (event, sessionId) => {
    return database.getSession(sessionId);
});

ipcMain.handle("analyze-case", async (event, { ecgPaths, pdfPaths, sessionId }) => {
    if (!isAIReady) throw new Error("AI is still initializing. Please wait...");
    console.log("Analyzing Case:", { ecgPaths, pdfPaths, sessionId });
    try {
        const ecgs = Array.isArray(ecgPaths) ? ecgPaths : (ecgPaths ? [ecgPaths] : []);
        const pdfs = Array.isArray(pdfPaths) ? pdfPaths : (pdfPaths ? [pdfPaths] : []);

        // Build PDF portion of the prompt (shared across all ECGs)
        let pdfPromptPart = "";
        pdfs.forEach((p) => { pdfPromptPart += ` [Report: ${p}]`; });

        const results = [];
        const total = Math.max(ecgs.length, 1);

        for (let i = 0; i < total; i++) {
            // Send progress
            if (mainWindow) {
                mainWindow.webContents.send('analysis-progress', {
                    current: i + 1,
                    total: total,
                    fileName: ecgs[i] ? ecgs[i].split(/[/\\]/).pop() : 'Report Only'
                });
            }

            let prompt = "Please analyze this patient case.";
            if (ecgs[i]) prompt += ` [ECG: ${ecgs[i]}]`;
            prompt += pdfPromptPart;
            prompt += " Provide a comprehensive assessment including findings from the ECG and history from the report(s).";

            const inputs = { messages: [{ role: "user", content: prompt }] };
            const result = await appAgent.invoke(inputs);

            results.push({
                ecgPath: ecgs[i] || null,
                ecgFileName: ecgs[i] ? ecgs[i].split(/[/\\]/).pop() : null,
                clinical_assessment: result.clinicalAssessment,
                ecg_findings: result.ecgFindings,
                report_findings: result.reportFindings,
                next_steps: result.nextSteps,
                lifestyle_recommendations: result.lifestyleRecommendations,
                heatmap: result.heatmapPath
            });
        }

        // Save to DB
        if (sessionId) {
            const firstImage = (ecgs.length > 0) ? ecgs[0] : null;
            await database.addMessage(sessionId, 'user', "Analysis Request", firstImage);

            const historyPayload = { results };
            await database.addMessage(sessionId, 'assistant', JSON.stringify(historyPayload));
        }

        return { results };

    } catch (error) {
        console.error("Analysis Error:", error);
        throw error;
    }
});


ipcMain.handle("send-message", async (event, { sessionId, content, imagePath }) => {
    // 1. Save User Message
    database.addMessage(sessionId, "user", content, imagePath);

    // 2. Run Agent
    try {
        // Stream placeholders for now, real streaming requires 
        // hooking into LangGraph's streaming events or Llama's onToken

        const inputs = {
            messages: [{ role: "user", content: imagePath ? imagePath : content }] // Hack: passing path as content for router
        };

        const result = await appAgent.invoke(inputs);
        const lastMsg = result.messages[result.messages.length - 1];
        const botResponse = lastMsg.content;

        // 3. Save Assistant Message
        database.addMessage(sessionId, "assistant", botResponse);

        return { role: "assistant", content: botResponse };
    } catch (error) {
        console.error("Agent Error:", error);
        return { role: "assistant", content: "Error processing request." };
    }
});
