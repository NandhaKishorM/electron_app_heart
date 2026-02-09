
const { contextBridge, ipcRenderer, webUtils } = require("electron");

// Simple Markdown Parser (No dependencies) to avoid build issues
function simpleMarkdown(text) {
    if (!text) return "";
    let html = text
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
        .replace(/\*(.*)\*/gim, '<i>$1</i>')
        .replace(/\n/gim, '<br>');
    return html;
}

contextBridge.exposeInMainWorld("api", {
    getSessions: () => ipcRenderer.invoke("get-history"),
    getMessages: (sessionId) => ipcRenderer.invoke("get-messages", sessionId),
    createSession: (title) => ipcRenderer.invoke("create-session", title),
    sendMessage: (data) => ipcRenderer.invoke("send-message", data),
    analyzeCase: (data) => ipcRenderer.invoke("analyze-case", data),
    onAIStatus: (callback) => ipcRenderer.on('ai-status', (event, value) => callback(value)),
    parseMarkdown: (text) => simpleMarkdown(text),
    getFilePath: (file) => webUtils.getPathForFile(file),
    // Missing handlers
    deleteSession: (id) => ipcRenderer.invoke("delete-session", id),
    clearHistory: () => ipcRenderer.invoke("clear-history"),
    getSettings: () => ipcRenderer.invoke("get-settings"),
    saveSetting: (key, value) => ipcRenderer.invoke("save-setting", { key, value }),
    getSession: (id) => ipcRenderer.invoke("get-session", id)
});
