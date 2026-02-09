
const { getSessions, getMessages, createSession, sendMessage } = window.api;

// State
let selectedECGs = [];
let selectedPDFs = [];

// DOM Elements
const homeTab = document.getElementById('home-tab');
const resultsView = document.getElementById('results-view');
const loaderOverlay = document.getElementById('loader-overlay');
const analyzeBtn = document.getElementById('analyze-btn');
const backToHomeBtn = document.getElementById('back-to-home');

// Upload Elements
const ecgDropZone = document.getElementById('ecg-drop-zone');
const ecgInput = document.getElementById('ecg-input');
const ecgStatus = document.getElementById('ecg-status');

const pdfDropZone = document.getElementById('pdf-drop-zone');
const pdfInput = document.getElementById('pdf-input');
const pdfStatus = document.getElementById('pdf-status');

// Result Elements
const resultTabs = document.querySelectorAll('.result-tab');
const resultPanels = document.querySelectorAll('.result-panel');
const combinedSummary = document.getElementById('analysis-summary');
const pdfExtractedText = document.getElementById('pdf-extracted-text');
const ecgPreviewImg = document.getElementById('ecg-preview-img');
const heatmapImg = document.getElementById('heatmap-img');

// --- Drag & Drop Handlers ---

function setupDragDrop(zone, input, type) {
    console.log(`Setting up Drag & Drop for ${type}`);
    zone.addEventListener('click', () => {
        console.log(`Click detected on ${type} zone`);
        input.click();
    });

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-active');
        zone.style.background = 'rgba(59, 130, 246, 0.1)';
        zone.style.borderColor = 'var(--accent)';
    });

    zone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-active');
        zone.style.background = '';
        zone.style.borderColor = '';
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-active');
        zone.style.background = '';
        zone.style.borderColor = '';

        if (e.dataTransfer.files.length) {
            handleFileSelection(e.dataTransfer.files, type);
        }
    });

    input.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFileSelection(e.target.files, type);
        }
    });
}


// State Helper
function getSelectedFiles() {
    return { ecg: selectedECGs, pdf: selectedPDFs };
}

// ...

function resetAnalysis() {
    selectedECGs = [];
    selectedPDFs = [];
    ecgStatus.innerHTML = '';
    ecgStatus.classList.add('hidden');
    pdfStatus.innerHTML = '';
    pdfStatus.classList.add('hidden');

    ecgPreviewImg.src = '';
    ecgPreviewImg.style.display = 'none';

    updateAnalyzeButton();
}

// Updated File Selection Logic
function handleFileSelection(files, type) {
    if (!files || files.length === 0) return;

    // files is a FileList or array of files
    Array.from(files).forEach(file => {
        const filePath = window.api.getFilePath(file);
        console.log(`File selected [${type}]:`, file.name, "Path:", filePath);

        if (type === 'ecg') {
            // Prevent duplicates
            if (!selectedECGs.includes(filePath)) {
                selectedECGs.push(filePath);
            }
        } else {
            if (!selectedPDFs.includes(filePath)) {
                selectedPDFs.push(filePath);
            }
        }
    });

    if (type === 'ecg') {
        updateFileList(ecgStatus, selectedECGs, 'ecg');
        // Preview the *first* newly added one or last? Let's just update preview to last added
        if (selectedECGs.length > 0) {
            ecgPreviewImg.src = `file://${selectedECGs[selectedECGs.length - 1]}`;
            ecgPreviewImg.style.display = 'block';
        }
    } else {
        updateFileList(pdfStatus, selectedPDFs, 'pdf');
    }

    updateAnalyzeButton();
}

// Updated List with Remove Icon
function updateFileList(element, files, type) {
    if (files.length === 0) {
        element.innerHTML = '';
        element.classList.add('hidden');
        return;
    }
    element.classList.remove('hidden');
    element.innerHTML = files.map((f, index) => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-secondary); padding:4px 8px; border-radius:4px; margin-bottom:4px; font-size:0.9rem;">
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80%;" title="${f}">${f.split(/[/\\]/).pop()}</span>
            <button onclick="removeFile('${type}', ${index})" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:1.1rem; line-height:1;">&times;</button>
        </div>
    `).join('');
}

// Global Remove Function (needs to be attached to window to work with inline onclick string)
window.removeFile = (type, index) => {
    if (type === 'ecg') {
        selectedECGs.splice(index, 1);
        updateFileList(ecgStatus, selectedECGs, 'ecg');
        if (selectedECGs.length === 0) {
            ecgPreviewImg.src = '';
            ecgPreviewImg.style.display = 'none';
        }
    } else {
        selectedPDFs.splice(index, 1);
        updateFileList(pdfStatus, selectedPDFs, 'pdf');
    }
    updateAnalyzeButton();
};

function updateAnalyzeButton() {
    console.log("Updating Button State. ECGs:", selectedECGs.length, "PDFs:", selectedPDFs.length);
    if (selectedECGs.length > 0 || selectedPDFs.length > 0) {
        analyzeBtn.removeAttribute('disabled');
        analyzeBtn.disabled = false;
    } else {
        analyzeBtn.setAttribute('disabled', 'true');
        analyzeBtn.disabled = true;
    }
}

setupDragDrop(ecgDropZone, ecgInput, 'ecg');
setupDragDrop(pdfDropZone, pdfInput, 'pdf');

// --- AI Status Listener ---
const startupLoader = document.getElementById('startup-loader');
const startupText = startupLoader.querySelector('.loading-text');
const startupProgressBar = document.getElementById('startup-progress-bar');

window.api.onAIStatus((data) => {
    console.log("AI Status Received:", data);

    // Handle both old string format and new object format
    const status = (typeof data === 'string') ? data : data.status;
    const message = (typeof data === 'object') ? data.message : null;
    const percent = (typeof data === 'object') ? data.percent : 0;

    if (status === 'loading') {
        if (startupLoader) startupLoader.classList.remove('hidden');
        if (startupText) {
            startupText.textContent = `${message || 'Initializing...'} (${percent}%)`;
            startupText.style.color = 'var(--accent)';
        }
        if (startupProgressBar) {
            startupProgressBar.style.width = `${percent}%`;
        }
    } else if (status === 'ready') {
        // Hide Startup Loader
        if (startupLoader) startupLoader.classList.add('hidden');
        console.log("AI Ready. Hiding Overlay.");
    } else {
        // Show Error in Loader
        if (startupText) {
            startupText.textContent = `Error: ${message || 'System Failure'}`;
            startupText.style.color = "var(--danger)";
        }
        if (startupProgressBar) {
            startupProgressBar.style.background = "var(--danger)";
            startupProgressBar.style.width = "100%";
        }
    }
});

// --- Analysis Logic ---

analyzeBtn.addEventListener('click', async () => {
    loaderOverlay.classList.remove('hidden');

    try {
        // 1. Create Session
        const sessionId = await createSession(`Analysis ${new Date().toLocaleTimeString()}`);

        // 2. Real IPC Call
        // 2. Real IPC Call
        // Pass arrays now + sessionId for saving
        const result = await window.api.analyzeCase({
            ecgPaths: selectedECGs,
            pdfPaths: selectedPDFs,
            sessionId: sessionId
        });

        // 3. Populate Results
        console.log("DEBUG: Graph Result:", result);

        const formatList = (data) => {
            if (Array.isArray(data)) return data.map(item => `- ${item}`).join('\n');
            return data || "Information not provided.";
        };

        const assessment = result.clinical_assessment || "Information not provided.";
        const nextSteps = formatList(result.next_steps);
        const lifestyle = formatList(result.lifestyle_recommendations);
        const ecgFindings = result.ecg_findings || "Information not provided.";
        const reportFindings = result.report_findings || "Information not provided.";

        // Populate Tabs
        document.getElementById('analysis-summary').innerHTML = window.api.parseMarkdown(assessment);
        document.getElementById('next-steps-content').innerHTML = window.api.parseMarkdown(nextSteps);
        document.getElementById('lifestyle-content').innerHTML = window.api.parseMarkdown(lifestyle);
        document.getElementById('ecg-analysis-content').innerHTML = window.api.parseMarkdown(ecgFindings);
        document.getElementById('report-analysis-content').innerHTML = window.api.parseMarkdown(reportFindings);

        // Handle ECG/Heatmap
        // Handle ECG/Heatmap
        const selectedHeatmap = result.heatmap || (result.ecg_findings ? null : "");

        if (selectedECGs.length > 0) {
            ecgPreviewImg.src = `file://${selectedECGs[0]}`;
            ecgPreviewImg.style.display = 'block';

            // Heatmap extraction from state
            const finalHeatmap = result.heatmap;
            const heatmapTabBtn = document.querySelector('button[data-target="heatmap-panel"]');

            if (finalHeatmap) {
                heatmapImg.src = `file://${finalHeatmap}`;
                if (heatmapTabBtn) heatmapTabBtn.style.display = 'inline-block';
            } else {
                if (heatmapTabBtn) heatmapTabBtn.style.display = 'none';
            }
        } else {
            ecgPreviewImg.style.display = 'none';
            const heatmapTabBtn = document.querySelector('button[data-target="heatmap-panel"]');
            if (heatmapTabBtn) heatmapTabBtn.style.display = 'none';
        }

        // Handle PDF Text (Report Data Tab)
        if (selectedPDFs.length > 0) {
            pdfExtractedText.innerText = result.pdfText || "Extracted text unavailable.";
            document.querySelector('[data-target="history-panel"]').style.display = 'block';
        } else {
            pdfExtractedText.innerText = "No Report Uploaded.";
            document.querySelector('[data-target="history-panel"]').style.display = 'block';
        }

        // 4. Switch View
        homeTab.classList.remove('active');
        resultsView.classList.add('active');

        // Default to Assessment tab
        document.querySelector('[data-target="combined-panel"]').click();

    } catch (err) {
        console.error("Renderer Error:", err);
        alert("Analysis Error: " + err.message);
    } finally {
        loaderOverlay.classList.add('hidden');
    }
});

// --- Result Tab Switching ---
resultTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        resultTabs.forEach(t => t.classList.remove('active'));
        resultPanels.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const target = tab.getAttribute('data-target');
        document.getElementById(target).classList.add('active');
    });
});

backToHomeBtn.addEventListener('click', () => {
    resultsView.classList.remove('active');
    homeTab.classList.add('active');
    // Reset Analysis State
    resetAnalysis();
});

// --- Sidebar Tab Switching (Global) ---
// --- Sidebar Tab Switching (Global) ---
const navLinks = document.querySelectorAll('.nav-links li');
navLinks.forEach(link => {
    link.addEventListener('click', async () => {
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const tabName = link.getAttribute('data-tab');

        // Hide Results View when switching main tabs
        resultsView.classList.remove('active');

        // Hide all main tab contents
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        // Show selected tab content
        const selectedTab = document.getElementById(`${tabName}-tab`);
        if (selectedTab) {
            selectedTab.classList.add('active');
        }

        // Special logic for History Tab
        if (tabName === 'history') {
            loadHistory();
        }
    });
});

// --- History Logic (Search, Filter, Pagination) ---
let historyState = {
    page: 1,
    limit: 5,
    search: '',
    dateFrom: '',
    dateTo: ''
};

async function loadHistory() {
    const historyList = document.getElementById('full-history-list');

    // Ensure Controls Exist
    let controls = document.getElementById('history-controls');
    if (!controls) {
        controls = document.createElement('div');
        controls.id = 'history-controls';
        controls.style.marginBottom = '1rem';
        controls.style.display = 'flex';
        controls.style.gap = '10px';
        controls.style.flexWrap = 'wrap';
        controls.innerHTML = `
            <input type="text" id="history-search" placeholder="Search titles..." style="padding:8px; border-radius:6px; border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary); flex:1;">
            <input type="date" id="history-date-from" style="padding:8px; border-radius:6px; border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary);">
            <input type="date" id="history-date-to" style="padding:8px; border-radius:6px; border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary);">
            <button id="history-apply-btn" class="btn-primary" style="padding:8px 16px;">Filter</button>
        `;
        historyList.parentNode.insertBefore(controls, historyList);

        // Event Listeners
        document.getElementById('history-apply-btn').onclick = () => {
            historyState.page = 1;
            historyState.search = document.getElementById('history-search').value;
            historyState.dateFrom = document.getElementById('history-date-from').value;
            historyState.dateTo = document.getElementById('history-date-to').value;
            loadHistory();
        };
    }

    historyList.innerHTML = '<div class="loading-text">Loading history...</div>';

    try {
        const result = await window.api.getSessions(historyState);
        const { sessions, total, page, totalPages } = result;

        historyList.innerHTML = '';

        if (sessions.length === 0) {
            historyList.innerHTML = '<div class="placeholder-text">No analysis history found.</div>';
            return;
        }

        sessions.forEach(session => {
            // ... (Existing Item Generation Logic) ...
            const item = document.createElement('div');
            item.className = 'history-item card';
            item.style.marginBottom = '1rem';
            item.style.cursor = 'pointer';
            item.style.transition = 'all 0.2s ease';
            item.style.borderLeft = '4px solid var(--accent)';

            item.innerHTML = `
                <div class="history-content" style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1">
                        <h3 style="margin:0; font-size:1.1rem; color:var(--text-primary)">
                            ${session.title || 'Untitled Analysis'}
                        </h3>
                        <div style="display:flex; gap:10px; margin-top:0.5rem; font-size:0.85rem; color:var(--text-secondary)">
                            <span>📅 ${new Date(session.created_at).toLocaleDateString()}</span>
                            <span>⏰ ${new Date(session.created_at).toLocaleTimeString()}</span>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <button class="delete-btn" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; padding:5px; border-radius:4px; transition:all 0.2s;" title="Delete Session">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;

            // Delete Handler
            const deleteBtn = item.querySelector('.delete-btn');
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm('Are you sure you want to delete this analysis?')) {
                    try {
                        await window.api.deleteSession(session.id);
                        loadHistory(); // Reload to update pagination
                    } catch (err) {
                        console.error("Failed to delete session:", err);
                        alert("Failed to delete session.");
                    }
                }
            };

            deleteBtn.onmouseover = () => { deleteBtn.style.color = 'var(--danger)'; deleteBtn.style.background = 'rgba(239, 68, 68, 0.1)'; };
            deleteBtn.onmouseout = () => { deleteBtn.style.color = 'var(--text-secondary)'; deleteBtn.style.background = 'none'; };

            // Item Click Handler
            item.onclick = async () => {
                // ... (Same as before) ...
                await loadSessionDetails(session.id);
            };

            historyList.appendChild(item);
        });

        // Pagination Controls
        const pagination = document.createElement('div');
        pagination.style.display = 'flex';
        pagination.style.justifyContent = 'center';
        pagination.style.gap = '10px';
        pagination.style.marginTop = '1rem';
        pagination.innerHTML = `
            <button id="prev-page" ${page === 1 ? 'disabled' : ''} style="padding:5px 10px; background:var(--bg-secondary); border:1px solid var(--border); color:var(--text-primary); border-radius:4px; cursor:pointer;">Previous</button>
            <span style="align-self:center; color:var(--text-secondary);">Page ${page} of ${totalPages}</span>
            <button id="next-page" ${page === totalPages ? 'disabled' : ''} style="padding:5px 10px; background:var(--bg-secondary); border:1px solid var(--border); color:var(--text-primary); border-radius:4px; cursor:pointer;">Next</button>
        `;

        historyList.appendChild(pagination);

        document.getElementById('prev-page').onclick = () => {
            if (historyState.page > 1) {
                historyState.page--;
                loadHistory();
            }
        };
        document.getElementById('next-page').onclick = () => {
            if (historyState.page < totalPages) {
                historyState.page++;
                loadHistory();
            }
        };

    } catch (err) {
        historyList.innerHTML = `<div class="error-text">Failed to load history: ${err.message}</div>`;
    }
}

// Extracted Session Loader for clarity
async function loadSessionDetails(sessionId) {
    try {
        const result = await window.api.getSession(sessionId); // Assuming getSession returns the full session object
        const messages = result.messages;
        // ... (Same logic as before for populating UI) ...
        // Re-using logic from previous implementation
        // Find the analysis message (either old format or new JSON format)
        const analysisMsg = messages.reverse().find(m =>
            m.role === 'assistant' && (
                m.content.includes('## Clinical Assessment') ||
                m.content.trim().startsWith('{')
            )
        );

        if (!analysisMsg) {
            console.warn("No specific analysis found in this session.");
            // Fallback: If there's ANY assistant message, try to use it
            const fallbackMsg = messages.find(m => m.role === 'assistant');
            if (!fallbackMsg) {
                alert("No analysis found in this session.");
                return;
            }
        }

        // 3. Populate Results
        const rawContent = analysisMsg.content;
        console.log("DEBUG: Raw History Output:", rawContent);

        let assessmentData = {};

        try {
            const jsonPart = rawContent.replace(/\[HEATMAP_PATH:.*?\]/, '').trim();
            const cleanJson = jsonPart.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
            assessmentData = JSON.parse(cleanJson);
        } catch (e) {
            console.error("History JSON Parsing Failed:", e);
            // Fallback: If it's old legacy plain text or regex-formatted text
            assessmentData = {
                clinical_assessment: rawContent,
                ecg_findings: "Legacy format - see combined assessment.",
                report_findings: "Legacy format - see combined assessment.",
                next_steps: [],
                lifestyle_recommendations: []
            };
        }

        const formatList = (data) => {
            if (Array.isArray(data)) return data.map(item => `- ${item}`).join('\n');
            return data || "Information not provided.";
        };

        const assessment = assessmentData.clinical_assessment || "Information not provided.";
        const nextSteps = formatList(assessmentData.next_steps);
        const lifestyle = formatList(assessmentData.lifestyle_recommendations);
        const ecgFindings = assessmentData.ecg_findings || "No specific ECG findings.";
        const reportFindings = assessmentData.report_findings || "No report data.";

        // Populate Tabs
        document.getElementById('analysis-summary').innerHTML = window.api.parseMarkdown(assessment);
        document.getElementById('next-steps-content').innerHTML = window.api.parseMarkdown(nextSteps);
        document.getElementById('lifestyle-content').innerHTML = window.api.parseMarkdown(lifestyle);
        document.getElementById('ecg-analysis-content').innerHTML = window.api.parseMarkdown(ecgFindings);
        document.getElementById('report-analysis-content').innerHTML = window.api.parseMarkdown(reportFindings);

        const userMsg = messages.find(m => m.role === 'user' && m.image_path);
        const heatmapMatch = rawContent.match(/\[HEATMAP_PATH: (.*?)\]/);
        const heatmapPath = heatmapMatch ? heatmapMatch[1] : (assessmentData.heatmap || null);

        if (userMsg && userMsg.image_path) {
            ecgPreviewImg.src = `file://${userMsg.image_path}`;
            ecgPreviewImg.style.display = 'block';

            if (heatmapPath) {
                heatmapImg.src = `file://${heatmapPath}`;
                const heatmapTabBtn = document.querySelector('button[data-target="heatmap-panel"]');
                if (heatmapTabBtn) heatmapTabBtn.style.display = 'inline-block';
            } else {
                const heatmapTabBtn = document.querySelector('button[data-target="heatmap-panel"]');
                if (heatmapTabBtn) heatmapTabBtn.style.display = 'none';
            }
        }

        // 1. Set ECG Preview (Original Image)
        if (userMsg && userMsg.image_path) {
            document.getElementById('ecg-preview-img').src = `file://${userMsg.image_path}`;
            document.getElementById('ecg-preview-img').style.display = 'block';
        } else {
            // Fallback if no user image found (rare)
            document.getElementById('ecg-preview-img').style.display = 'none';
        }

        // 2. Set Heatmap Image
        if (heatmapPath) {
            document.getElementById('heatmap-img').src = `file://${heatmapPath}`;
            document.querySelector('[data-target="heatmap-panel"]').style.display = 'block';
        } else {
            document.querySelector('[data-target="heatmap-panel"]').style.display = 'none';
        }

        document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
        document.getElementById('results-view').classList.add('active');
        document.getElementById('history-tab').classList.remove('active');
        document.querySelector('[data-target="combined-panel"]')?.click();
    } catch (e) {
        console.error("Error loading session:", e);
        alert("Failed to load session details.");
    }
}

// Clear All History Handler - Updated to reload list
const clearHistoryBtn = document.getElementById('clear-history-btn');
if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to DELETE ALL history? This cannot be undone.')) {
            try {
                await window.api.clearHistory();
                loadHistory(); // Reload
            } catch (err) {
                console.error("Failed to clear history:", err);
                alert("Failed to clear history.");
            }
        }
    });
}


// --- Settings Logic ---
const userNameInput = document.getElementById('user-name');
const userIdInput = document.getElementById('user-id');
const userDeptInput = document.getElementById('user-dept');
const saveSettingsBtn = document.getElementById('save-settings-btn');

async function loadSettings() {
    try {
        const settings = await window.api.getSettings(); // Returns array of {key, value}
        if (!settings) return;

        const setVal = (key, input) => {
            const item = settings.find(s => s.key === key);
            if (item) input.value = item.value;
        };

        setVal('user_name', userNameInput);
        setVal('user_id', userIdInput);
        setVal('user_dept', userDeptInput);
    } catch (e) {
        console.error("Failed to load settings:", e);
    }
}

saveSettingsBtn.addEventListener('click', async () => {
    try {
        await window.api.saveSetting('user_name', userNameInput.value);
        await window.api.saveSetting('user_id', userIdInput.value);
        await window.api.saveSetting('user_dept', userDeptInput.value);
        alert("Settings saved successfully!");
    } catch (e) {
        console.error("Failed to save settings:", e);
        alert("Error saving settings.");
    }
});

// Load settings on startup
loadSettings();
