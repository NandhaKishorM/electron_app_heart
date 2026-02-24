
const { getSessions, getMessages, createSession, sendMessage } = window.api;

// State
let selectedECGs = [];
let selectedPDFs = [];
let analysisResults = []; // per-ECG results array
let activeEcgIndex = 0;

// DOM Elements
const homeTab = document.getElementById('home-tab');
const resultsView = document.getElementById('results-view');
const loaderOverlay = document.getElementById('loader-overlay');
const analyzeBtn = document.getElementById('analyze-btn');
const backToHomeBtn = document.getElementById('back-to-home');
const analysisProgressDetail = document.getElementById('analysis-progress-detail');

// Upload Elements
const ecgDropZone = document.getElementById('ecg-drop-zone');
const ecgInput = document.getElementById('ecg-input');
const ecgChips = document.getElementById('ecg-chips');

const pdfDropZone = document.getElementById('pdf-drop-zone');
const pdfInput = document.getElementById('pdf-input');
const pdfChips = document.getElementById('pdf-chips');

// Result Elements
const resultTabs = document.querySelectorAll('.result-tab');
const resultPanels = document.querySelectorAll('.result-panel');
const ecgPreviewImg = document.getElementById('ecg-preview-img');
const heatmapImg = document.getElementById('heatmap-img');

// --- File Chip Helpers ---

function createFileChip(fileName, filePath, type, index) {
    const chip = document.createElement('div');
    chip.className = 'file-chip';
    chip.dataset.index = index;
    chip.dataset.type = type;

    if (type === 'ecg') {
        const thumb = document.createElement('img');
        thumb.className = 'file-chip-thumbnail';
        thumb.src = `file://${filePath}`;
        thumb.alt = fileName;
        chip.appendChild(thumb);
    } else {
        const icon = document.createElement('div');
        icon.className = 'file-chip-icon';
        icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
        chip.appendChild(icon);
    }

    const name = document.createElement('span');
    name.className = 'file-chip-name';
    name.textContent = fileName;
    name.title = filePath;
    chip.appendChild(name);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'file-chip-remove';
    removeBtn.innerHTML = '×';
    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chip.classList.add('removing');
        setTimeout(() => {
            if (type === 'ecg') {
                selectedECGs = selectedECGs.filter(p => p !== filePath);
                renderChips('ecg');
            } else {
                selectedPDFs = selectedPDFs.filter(p => p !== filePath);
                renderChips('pdf');
            }
            updateAnalyzeButton();
        }, 200);
    });
    chip.appendChild(removeBtn);

    return chip;
}

function renderChips(type) {
    const container = type === 'ecg' ? ecgChips : pdfChips;
    const files = type === 'ecg' ? selectedECGs : selectedPDFs;
    container.innerHTML = '';
    files.forEach((filePath, i) => {
        const fileName = filePath.split(/[/\\]/).pop();
        container.appendChild(createFileChip(fileName, filePath, type, i));
    });
}

// --- Drag & Drop Handlers ---

function setupDragDrop(zone, input, type) {
    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-active');
    });

    zone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-active');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-active');
        if (e.dataTransfer.files.length) handleFileSelection(e.dataTransfer.files, type);
    });

    input.addEventListener('change', (e) => {
        if (e.target.files.length) handleFileSelection(e.target.files, type);
    });
}

function resetAnalysis() {
    selectedECGs = [];
    selectedPDFs = [];
    analysisResults = [];
    activeEcgIndex = 0;
    ecgChips.innerHTML = '';
    pdfChips.innerHTML = '';
    ecgPreviewImg.src = '';
    ecgPreviewImg.style.display = 'none';
    if (heatmapImg) heatmapImg.src = '';
    ecgInput.value = '';
    pdfInput.value = '';
    updateAnalyzeButton();
}

function handleFileSelection(files, type) {
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
        const filePath = window.api.getFilePath(file);
        if (type === 'ecg') {
            if (!selectedECGs.includes(filePath)) selectedECGs.push(filePath);
        } else {
            if (!selectedPDFs.includes(filePath)) selectedPDFs.push(filePath);
        }
    });

    renderChips(type);
    updateAnalyzeButton();
}

function updateAnalyzeButton() {
    const hasFiles = selectedECGs.length > 0 || selectedPDFs.length > 0;
    analyzeBtn.disabled = !hasFiles;
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

    if (status === 'downloading') {
        if (startupLoader) startupLoader.classList.remove('hidden');
        if (startupText) {
            const fileName = data.fileName || 'model';
            const dlMB = data.downloadedMB || '0';
            const totalMB = data.totalMB || '?';
            const fileIdx = data.fileIndex || 1;
            const totalFiles = data.totalFiles || 3;
            startupText.textContent = `Downloading ${fileName} (${fileIdx}/${totalFiles})... ${dlMB} MB / ${totalMB} MB (${data.downloadPercent || 0}%)`;
            startupText.style.color = 'var(--accent)';
        }
        if (startupProgressBar) {
            startupProgressBar.style.width = `${percent}%`;
        }
    } else if (status === 'loading') {
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

// --- Analysis Progress Listener ---
window.api.onAnalysisProgress((data) => {
    if (analysisProgressDetail) {
        analysisProgressDetail.textContent = `Analyzing ECG ${data.current}/${data.total}: ${data.fileName}`;
    }
});

// --- Per-ECG Result Display ---
function showEcgResult(index) {
    if (!analysisResults || index >= analysisResults.length) return;
    activeEcgIndex = index;
    const r = analysisResults[index];

    const formatList = (data) => {
        if (Array.isArray(data)) return data.map(item => `- ${item}`).join('\n');
        return data || "Information not provided.";
    };

    // Populate per-ECG fields
    document.getElementById('analysis-summary').innerHTML = window.api.parseMarkdown(r.clinical_assessment || 'N/A');
    document.getElementById('ecg-analysis-content').innerHTML = window.api.parseMarkdown(r.ecg_findings || 'N/A');
    document.getElementById('report-analysis-content').innerHTML = window.api.parseMarkdown(r.report_findings || 'N/A');
    document.getElementById('next-steps-content').innerHTML = window.api.parseMarkdown(formatList(r.next_steps));
    document.getElementById('lifestyle-content').innerHTML = window.api.parseMarkdown(formatList(r.lifestyle_recommendations));

    // ECG Preview
    if (r.ecgPath) {
        ecgPreviewImg.src = `file://${r.ecgPath}`;
        ecgPreviewImg.style.display = 'block';
    } else {
        ecgPreviewImg.style.display = 'none';
    }

    // Heatmap
    const heatmapTabBtn = document.querySelector('button[data-target="heatmap-panel"]');
    if (r.heatmap) {
        heatmapImg.src = `file://${r.heatmap}`;
        if (heatmapTabBtn) heatmapTabBtn.style.display = 'inline-block';
    } else {
        if (heatmapTabBtn) heatmapTabBtn.style.display = 'none';
    }

    // Update ECG selector pills active state
    document.querySelectorAll('.ecg-selector-pill').forEach((pill, i) => {
        pill.classList.toggle('active', i === index);
    });
}

function buildEcgSelectorBar(results) {
    const bar = document.getElementById('ecg-selector-bar');
    bar.innerHTML = '';

    if (results.length <= 1) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';
    results.forEach((r, i) => {
        const pill = document.createElement('button');
        pill.className = 'ecg-selector-pill' + (i === 0 ? ' active' : '');

        if (r.ecgPath) {
            const thumb = document.createElement('img');
            thumb.className = 'ecg-selector-pill-thumb';
            thumb.src = `file://${r.ecgPath}`;
            pill.appendChild(thumb);
        }

        const label = document.createElement('span');
        label.textContent = r.ecgFileName || `ECG ${i + 1}`;
        pill.appendChild(label);

        pill.addEventListener('click', () => showEcgResult(i));
        bar.appendChild(pill);
    });
}

// --- Analysis Logic ---

analyzeBtn.addEventListener('click', async () => {
    loaderOverlay.classList.remove('hidden');
    if (analysisProgressDetail) analysisProgressDetail.textContent = 'Preparing analysis...';

    try {
        const sessionId = await createSession(`Analysis ${new Date().toLocaleTimeString()}`);

        const response = await window.api.analyzeCase({
            ecgPaths: selectedECGs,
            pdfPaths: selectedPDFs,
            sessionId: sessionId
        });

        analysisResults = response.results || [];
        console.log("DEBUG: Per-ECG Results:", analysisResults);

        // Build ECG selector if multiple ECGs
        buildEcgSelectorBar(analysisResults);

        // Show report data
        const pdfExtractedText = document.getElementById('pdf-extracted-text');
        if (analysisResults.length > 0 && analysisResults[0].report_findings) {
            pdfExtractedText.innerText = analysisResults[0].report_findings;
        } else {
            pdfExtractedText.innerText = selectedPDFs.length > 0 ? 'See Report Analysis tab.' : 'No Report Uploaded.';
        }

        // Display first ECG result
        if (analysisResults.length > 0) showEcgResult(0);

        // Switch View
        homeTab.classList.remove('active');
        resultsView.classList.add('active');
        document.querySelector('[data-target="combined-panel"]').click();

    } catch (err) {
        console.error("Renderer Error:", err);
        alert("Analysis Error: " + err.message);
    } finally {
        loaderOverlay.classList.add('hidden');
        if (analysisProgressDetail) analysisProgressDetail.textContent = '';
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
        const result = await window.api.getSession(sessionId);
        const messages = result.messages;

        const analysisMsg = messages.reverse().find(m =>
            m.role === 'assistant' && (
                m.content.includes('## Clinical Assessment') ||
                m.content.trim().startsWith('{')
            )
        );

        if (!analysisMsg) {
            const fallbackMsg = messages.find(m => m.role === 'assistant');
            if (!fallbackMsg) {
                alert("No analysis found in this session.");
                return;
            }
        }

        const rawContent = analysisMsg.content;
        let assessmentData = {};

        try {
            const jsonPart = rawContent.replace(/\[HEATMAP_PATH:.*?\]/, '').trim();
            const cleanJson = jsonPart.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
            assessmentData = JSON.parse(cleanJson);
        } catch (e) {
            assessmentData = {
                clinical_assessment: rawContent,
                ecg_findings: "Legacy format - see combined assessment.",
                report_findings: "Legacy format - see combined assessment.",
                next_steps: [],
                lifestyle_recommendations: []
            };
        }

        // Handle new multi-result format
        if (assessmentData.results && Array.isArray(assessmentData.results)) {
            analysisResults = assessmentData.results;
            buildEcgSelectorBar(analysisResults);
            if (analysisResults.length > 0) showEcgResult(0);
        } else {
            // Legacy single-result format
            analysisResults = [assessmentData];
            buildEcgSelectorBar(analysisResults);
            showEcgResult(0);
        }

        // Set ECG preview from user message if available
        const userMsg = messages.find(m => m.role === 'user' && m.image_path);
        if (userMsg && userMsg.image_path && (!analysisResults[0] || !analysisResults[0].ecgPath)) {
            ecgPreviewImg.src = `file://${userMsg.image_path}`;
            ecgPreviewImg.style.display = 'block';
        }

        // Heatmap from legacy format
        const heatmapMatch = rawContent.match(/\[HEATMAP_PATH: (.*?)\]/);
        const heatmapPath = heatmapMatch ? heatmapMatch[1] : (assessmentData.heatmap || null);
        if (heatmapPath && analysisResults[0] && !analysisResults[0].heatmap) {
            heatmapImg.src = `file://${heatmapPath}`;
            const heatmapTabBtn = document.querySelector('button[data-target="heatmap-panel"]');
            if (heatmapTabBtn) heatmapTabBtn.style.display = 'inline-block';
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


// --- Image Lightbox ---
const lightbox = document.getElementById('image-lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxWrapper = document.getElementById('lightbox-image-wrapper');
let lbZoom = 1;
let lbPanX = 0, lbPanY = 0;

function applyLightboxTransform() {
    lightboxImg.style.transform = `translate(${lbPanX}px, ${lbPanY}px) scale(${lbZoom})`;
}

function openLightbox(src) {
    if (!src) return;
    lightboxImg.src = src;
    lbZoom = 1;
    lbPanX = 0;
    lbPanY = 0;
    applyLightboxTransform();
    lightbox.style.display = 'flex';
}

function closeLightbox() {
    lightbox.style.display = 'none';
    lightboxImg.src = '';
    lbZoom = 1;
    lbPanX = 0;
    lbPanY = 0;
}

document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
document.getElementById('lightbox-zoom-in').addEventListener('click', () => {
    lbZoom = Math.min(lbZoom + 0.25, 5);
    applyLightboxTransform();
});
document.getElementById('lightbox-zoom-out').addEventListener('click', () => {
    lbZoom = Math.max(lbZoom - 0.25, 0.25);
    applyLightboxTransform();
});
document.getElementById('lightbox-fit').addEventListener('click', () => {
    lbZoom = 1;
    lbPanX = 0;
    lbPanY = 0;
    applyLightboxTransform();
});

// Mouse wheel zoom
lightboxWrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    lbZoom = Math.max(0.25, Math.min(5, lbZoom + delta));
    applyLightboxTransform();
});

// Click outside window (backdrop) to close
lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
});

// Escape to close
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox.style.display === 'flex') closeLightbox();
});

// Drag to pan
let lbDragging = false, lbDragStartX, lbDragStartY, lbPanStartX, lbPanStartY;
lightboxWrapper.addEventListener('mousedown', (e) => {
    e.preventDefault();
    lbDragging = true;
    lbDragStartX = e.clientX;
    lbDragStartY = e.clientY;
    lbPanStartX = lbPanX;
    lbPanStartY = lbPanY;
});
document.addEventListener('mousemove', (e) => {
    if (!lbDragging) return;
    lbPanX = lbPanStartX + (e.clientX - lbDragStartX);
    lbPanY = lbPanStartY + (e.clientY - lbDragStartY);
    applyLightboxTransform();
});
document.addEventListener('mouseup', () => { lbDragging = false; });

// Make ECG preview and heatmap clickable
ecgPreviewImg.addEventListener('click', () => openLightbox(ecgPreviewImg.src));
heatmapImg.addEventListener('click', () => openLightbox(heatmapImg.src));

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
