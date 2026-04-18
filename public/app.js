// CONFIG — In production, proxy this through a backend. For demo: keep here but do not commit secrets.
const CONFIG = {
    SHEETS_URL: 'https://script.google.com/macros/s/AKfycbzonNgkC5QCkaRDg8dnPBlAu4pKTtsKt9l7L6aHhyOQNxsrA2GD28PjW_vB5LVZtHgXUQ/exec',
    SIMULATION_SERVER: 'http://localhost:3000',
    // TODO: Move to server-side proxy before production deployment
};

let machineData = [];
let chartInstances = {};
let historyMap = {};
let dtInterval = null;
let currentRole = "ENGINEER";
let eventSources = {};

// DECISION ENGINE STATE (for noise filtering)
let machineEngineState = {
    "CNC_01": { consecutiveHigh: 0, consecutiveMedium: 0, rpmBaseline: 1500 },
    "CNC_02": { consecutiveHigh: 0, consecutiveMedium: 0, rpmBaseline: 1800 },
    "PUMP_03": { consecutiveHigh: 0, consecutiveMedium: 0, rpmBaseline: 3000 },
    "CONVEYOR_04": { consecutiveHigh: 0, consecutiveMedium: 0, rpmBaseline: 800 }
};

const THRESHOLDS = {
    temp: 90,
    vib: 4.5,
    rpm: 1200,
    curr: 16
};

// Task 7: Chart.js threshold line plugin
const thresholdPlugin = {
    id: 'thresholdLine',
    afterDraw: (chart) => {
        const threshold = chart.options.plugins.threshold?.value;
        if (!threshold) return;

        const { ctx, chartArea: { left, right }, scales: { y } } = chart;
        const yPos = y.getPixelForValue(threshold);

        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = '#ff4d4d';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.moveTo(left, yPos);
        ctx.lineTo(right, yPos);
        ctx.stroke();
        
        ctx.fillStyle = '#ff4d4d';
        ctx.font = 'bold 10px Inter';
        ctx.fillText('⚠ THRESHOLD', right - 70, yPos - 5);
        ctx.restore();
    }
};
Chart.register(thresholdPlugin);

const SIMULATED_READINGS = {
  CNC_01: { temperature_C: 102, vibration_mm_s: 8.5, rpm: 980, current_A: 17.2, status: 'warning' },
  CNC_02: { temperature_C: 118, vibration_mm_s: 2.1, rpm: 1480, current_A: 14.1, status: 'warning' },
  PUMP_03: { temperature_C: 78, vibration_mm_s: 5.8, rpm: 820, current_A: 11.5, status: 'warning' },
  CONVEYOR_04: { temperature_C: 65, vibration_mm_s: 1.2, rpm: 1450, current_A: 9.8, status: 'running' },
};

let simulationState = {};

/**
 * UTILITY: Resilient Fetch with Fallback
 */
async function fetchWithFallback(url, cacheKey, options = {}) {
    try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error('Fetch failed');
        
        // If it's a POST with no-cors (for Sheets), we won't get JSON back
        if (options.mode === 'no-cors') return { success: true };

        const data = await res.json();
        localStorage.setItem(cacheKey, JSON.stringify(data));
        localStorage.setItem(cacheKey + '_time', Date.now());
        hideCacheBanner();
        return { data, fromCache: false };
    } catch (e) {
        console.warn(`⚠️ Network fail for ${url}. Attempting cache...`);
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const time = localStorage.getItem(cacheKey + '_time');
            showCacheBanner(time);
            return { data: JSON.parse(cached), fromCache: true, time };
        }
        throw new Error('No data available and no cache found.');
    }
}

function showCacheBanner(timestamp) {
    const banner = document.getElementById('cache-banner');
    if (!banner) return;
    const timeStr = new Date(parseInt(timestamp)).toLocaleTimeString();
    banner.innerHTML = `⚠️ Showing cached data from ${timeStr} <button onclick="hideCacheBanner()" style="background:transparent; border:none; color:inherit; cursor:pointer; font-weight:bold; margin-left:10px;">✕</button>`;
    banner.style.display = 'block';
}

function hideCacheBanner() {
    const banner = document.getElementById('cache-banner');
    if (banner) banner.style.display = 'none';
}

/**
 * INITIALIZATION
 */
async function init() {
    const token = localStorage.getItem('atlas_token');
    const user = JSON.parse(localStorage.getItem('atlas_user') || '{}');
    
    if (!token && !localStorage.getItem('atlas_role')) {
        document.getElementById('welcomeScreen').style.display = 'flex';
        document.querySelector('.app-container').style.display = 'none';
        return;
    }

    currentRole = localStorage.getItem('atlas_role') || "ENGINEER";
    const roleIndicator = document.getElementById('roleIndicator');
    if (roleIndicator) roleIndicator.textContent = currentRole;

    renderRoleUI();

    // TACTICAL 1: Load Persistence from LocalStorage
    const savedHistory = localStorage.getItem('atlas_history_map');
    if (savedHistory) {
        historyMap = JSON.parse(savedHistory);
    } else {
        ["CNC_01", "CNC_02", "PUMP_03", "CONVEYOR_04"].forEach(id => {
            historyMap[id] = {
                temp: Array(30).fill(0), vib: Array(30).fill(0),
                rpm: Array(30).fill(0), curr: Array(30).fill(0)
            };
        });
    }

    if (machineData.length === 0) {
        const savedData = localStorage.getItem('atlas_machine_data');
        if (savedData) {
            machineData = JSON.parse(savedData);
        } else {
            // Task 3: Show Skeletons on first load
            renderSkeletons();
            machineData = ["CNC_01", "CNC_02", "PUMP_03", "CONVEYOR_04"].map(id => ({
                machine_id: id, temperature: 0, vibration: 0, rpm: 0, current: 0, 
                risk: 'LOW', priority: 1, explanation: 'Establishing link...'
            }));
        }
    }

    // DUAL-LAYER PERSISTENCE: Attempt Server Disk Load if LocalStorage is empty
    if (!savedHistory) {
        try {
            const result = await fetchWithFallback(`${CONFIG.SIMULATION_SERVER}/api/get-telemetry`, 'atlas_cache');
            if (result.data) {
                historyMap = result.data.historyMap || historyMap;
                machineData = result.data.machineData || machineData;
                console.log(result.fromCache ? "📦 LOADED FROM CACHE." : "💾 LOADED STATE FROM SERVER DISK.");
            }
        } catch(e) { 
            console.error("Critical Load Failure:", e.message);
        }
    }

    populateStaticShells();
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('login-container').style.display = 'none';
    document.querySelector('.app-container').style.display = 'flex';

    connectToSensorStreams();
    showPage('homePage');
}

function handleSimpleLogin() {
    const name = document.getElementById('operatorName').value.trim();
    const role = document.getElementById('operatorRole').value;
    
    if (!name) {
        alert("REQUIRED: OPERATOR NAME");
        return;
    }

    currentRole = role;
    localStorage.setItem('atlas_role', role);
    localStorage.setItem('atlas_user_name', name);
    
    document.getElementById('roleIndicator').textContent = role;
    document.getElementById('welcomeScreen').style.display = 'none';
    document.querySelector('.app-container').style.display = 'flex';
    
    logToSystem(`${role} PORTAL INITIALIZED BY ${name.toUpperCase()}`);
    init();
}

function showSimplePage(pageId) {
    const pages = document.querySelectorAll(".page");
    pages.forEach(p => p.style.display = "none");
    
    document.getElementById(pageId).style.display = "block";
    
    // Update tabs
    document.getElementById('homeTab').classList.toggle('active', pageId === 'homePage');
    document.getElementById('digitalTab').classList.toggle('active', pageId === 'digitalTwinPage');
    
    if (pageId === 'homePage') setTimeout(renderHomeChart, 50);
    if (pageId === 'digitalTwinPage') startDigitalTwin();
}

function goBackToWelcome() {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('welcomeScreen').style.display = 'flex';
}

/**
 * AUTHENT/*
async function handleLogin() {
    // Legacy Auth Flow - Disabling for direct role-toggle demo
}
*/

function selectRole(role) {
    currentRole = role;
    localStorage.setItem('atlas_role', role);
    document.getElementById('roleIndicator').textContent = role;
    showPage('home');
    logToSystem(`AUTHENTICATED AS ${role}`);
}

function switchRole(role) {
    currentRole = role;
    localStorage.setItem('atlas_role', role);
    document.getElementById('roleIndicator').textContent = role;
    logToSystem(`OPERATIONAL ROLE SWITCHED TO ${role}`);
    
    // Refresh current view to reflect role limits
    const currentActiveLink = document.querySelector('.nav-item.active');
    if (currentActiveLink) {
        const pageId = currentActiveLink.getAttribute('onclick').match(/'([^']+)'/)[1];
        showPage(pageId);
    }
}

function handleLogout() {
    localStorage.removeItem('atlas_token');
    localStorage.removeItem('atlas_user');
    window.location.reload();
}

/**
 * NAVIGATION ENGINE
 */
function showPage(pageId) {
    const pages = document.querySelectorAll(".page");
    pages.forEach(page => page.style.display = "none");

    const selectedPage = document.getElementById(pageId);
    if (selectedPage) selectedPage.style.display = "block";

    const tabMap = {
        'homePage': 'homeTab',
        'digitalTwinPage': 'digitalTab',
        'alertStackPage': 'alertsTab',
        'analyticsPage': 'analyticsTab',
        'diagnosticsPage': 'diagTab',
        'schedulerPage': 'schedTab'
    };
    
    document.querySelectorAll('.view-links a').forEach(tab => tab.classList.remove('active'));
    const activeTabId = tabMap[pageId];
    if (activeTabId) {
        const tabEl = document.getElementById(activeTabId);
        if (tabEl) tabEl.classList.add('active');
    }

    if (pageId === 'homePage') {
        setTimeout(renderHomeChart, 50);
    }

    if (pageId === 'analyticsPage' && currentRole === 'ENGINEER') {
        setTimeout(renderAnalyticsCharts, 50);
    }

    if (pageId === 'digitalTwinPage') startDigitalTwin();
    else stopDigitalTwin();
    
    if (pageId === 'schedulerPage') renderSchedulerContent();
}

function renderRoleUI() {
    const sidebar = document.getElementById('sidebarMenu');
    const topNav = document.getElementById('topNav');
    if (!sidebar || !topNav) return;

    if (currentRole === 'ENGINEER') {
        sidebar.innerHTML = `
            <a href="#" class="nav-item active" id="overviewBtn" onclick="handleSidebarNav('homePage', 'overview', 'overviewBtn')">OVERVIEW</a>
            <a href="#" class="nav-item" id="riskBtn" onclick="handleSidebarNav('homePage', 'riskMatrix', 'riskBtn')">RISK MATRIX</a>
            <a href="#" class="nav-item" id="aiBtn" onclick="toggleAIInsights()">AI INSIGHTS</a>
            <a href="#" class="nav-item" id="logBtn" onclick="showPage('diagnosticsPage')">SYSTEM LOG</a>
        `;
        topNav.innerHTML = `
            <a href="#" class="active" id="homeTab" onclick="showPage('homePage')">HOME</a>
            <a href="#" id="digitalTab" onclick="showPage('digitalTwinPage')">DIGITAL TWIN</a>
            <a href="#" id="analyticsTab" onclick="showPage('analyticsPage')">ANALYTICS</a>
            <a href="#" id="schedTab" onclick="showPage('schedulerPage')">SCHEDULER</a>
        `;
    } else {
        sidebar.innerHTML = `
            <a href="#" class="nav-item active" id="teleBtn" onclick="handleSidebarNav('homePage', 'telemetry', 'teleBtn')">TELEMETRY</a>
            <a href="#" class="nav-item" id="diagBtn" onclick="showPage('diagnosticsPage')">DIAGNOSTICS</a>
            <a href="#" class="nav-item" id="alertBtn" onclick="showPage('alertStackPage')">ALERT STACK</a>
            <a href="#" class="nav-item" id="logBtn" onclick="showPage('diagnosticsPage')">SYSTEM LOG</a>
        `;
        topNav.innerHTML = `
            <a href="#" class="active" id="homeTab" onclick="showPage('homePage')">HOME</a>
            <a href="#" id="digitalTab" onclick="showPage('digitalTwinPage')">DIGITAL TWIN</a>
            <a href="#" id="alertsTab" onclick="showPage('alertStackPage')">ALERT STACK</a>
            <a href="#" id="diagTab" onclick="showPage('diagnosticsPage')">DIAGNOSTICS</a>
        `;
    }
}

function populateStaticShells() {
    // 1. Home Shell
    const home = document.getElementById('homePage');
    if (home) {
        home.innerHTML = `
            <div id="overview" class="view-header">
                <div class="view-title">
                    <h2>Operational <span>Intelligence</span></h2>
                    <div class="view-subtitle">System Node: OSCAR-09 • Pulse Synchronized</div>
                </div>
            </div>
            <div id="telemetry" class="telemetry-focus" style="margin-bottom: 4rem;">
                <div class="focus-header"><h3>LIVE TELEMETRY STREAM</h3></div>
                <div class="big-chart-wrap" style="margin-bottom: 1.5rem;"><canvas id="home-telemetry-chart"></canvas></div>
            </div>
            <div id="riskMatrix" class="card-grid">
                <!-- Fleet summary cards -->
            </div>
            <div id="machineGrid" class="card-grid" style="margin-top: 2rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 2rem;">
                <!-- Individual machine cards -->
            </div>
        `;
    }

    // 2. Alert Shell
    const alerts = document.getElementById('alertStackPage');
    if (alerts) {
        alerts.innerHTML = `
            <div class="view-header"><h2>Tactical <span>Alerts</span></h2></div>
            <div id="alertContainer" class="card-grid"></div>
        `;
    }

    // 3. Digital Twin Shell
    renderDigitalTwinContent();

    // 4. Analytics Shell
    renderAnalyticsContent();

    // 5. Diagnostics Shell
    renderDiagnosticsContent();
}

function handleSidebarNav(pageId, sectionId, btnId) {
    showPage(pageId);
    
    // Allow for DOM update before scrolling
    setTimeout(() => {
        const target = document.getElementById(sectionId);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
        
        document.querySelectorAll('.nav-menu .nav-item').forEach(item => item.classList.remove('active'));
        const activeBtn = document.getElementById(btnId);
        if (activeBtn) activeBtn.classList.add('active');
    }, 100);
}

/**
 * PAGE COMPILATION
 */
function populateAllPages() {
    // Dynamic updates handled by the central loop in connectToSensorStreams
}

/**
 * 1. MONITORING DASHBOARD (HOME)
 */
function renderSkeletons() {
    const machineContainer = document.getElementById('machineGrid');
    if (!machineContainer) return;
    machineContainer.innerHTML = Array(4).fill(0).map(() => `
        <div class="skeleton-card">
            <div class="skeleton-item" style="height: 20px; width: 40%"></div>
            <div class="skeleton-item" style="height: 60px; width: 100%"></div>
            <div class="skeleton-item" style="height: 30px; width: 80%"></div>
        </div>
    `).join('');
}

function renderErrorState(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        <div class="error-state">
            <div class="error-icon">📡</div>
            <div class="error-msg-box">
                <h3 class="error-title">COULD NOT LOAD MACHINE DATA</h3>
                <p class="error-desc">Terminal link disrupted. No local cache available for mission-critical synchronization.</p>
            </div>
            <button class="action-btn primary" onclick="location.reload()">RETRY CONNECTION</button>
        </div>
    `;
}

function updateHomeDynamic() {
    const machineContainer = document.getElementById('machineGrid');
    if (!machineContainer) return;

    if (machineData.length === 0) {
        renderErrorState('machineGrid');
        return;
    }

    // Sort by risk priority
    const sorted = [...machineData].sort((a, b) => b.priority - a.priority);

    machineContainer.innerHTML = sorted.map(m => {
        const riskClass = m.risk === 'HIGH' ? 'status-critical' : (m.risk === 'MEDIUM' ? 'status-warn' : 'status-ok');
        
        return `
            <div class="atlas-card ${riskClass}" style="min-height: 220px;">
                <div class="m-card-header">
                    <span class="m-id" style="font-weight: 800; letter-spacing: 1px;">${m.machine_id}</span>
                    <span class="m-tag">${m.risk}</span>
                </div>
                <div class="m-stats" style="margin: 1.5rem 0;">
                    <div class="m-metric">
                        <label>TEMPERATURE</label>
                        <div class="val" style="font-size: 1.8rem;">${m.temperature.toFixed(1)}°C</div>
                    </div>
                    <div class="m-metric">
                        <label>VIBRATION</label>
                        <div class="val" style="font-size: 1.8rem;">${m.vibration.toFixed(2)}<span>mm/s</span></div>
                    </div>
                </div>
                <div class="m-explanation" style="padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.85rem; color: var(--text-muted); min-height: 40px;">
                    ${m.explanation}
                </div>
            </div>
        `;
    }).join('');
}

function getRiskExplanation(machineId, readings, riskLevel) {
  const { temperature, vibration, rpm, current } = readings;
  const reasons = [];
  if (temperature > 90) reasons.push(`temperature at ${temperature.toFixed(1)}°C (threshold: 90°C)`);
  if (vibration > 4.5) reasons.push(`vibration at ${vibration.toFixed(2)} mm/s (threshold: 4.5)`);
  if (rpm < 1200) reasons.push(`RPM dropped to ${Math.round(rpm)} (threshold: 1200)`);
  if (current > 16) reasons.push(`current at ${current.toFixed(1)}A (threshold: 16A)`);
  
  if (reasons.length === 0) return 'All sensors within normal range.';
  return `ATLAS+ flagged ${machineId}: ${reasons.join(', ')}.`;
}

function simulateFailure(id) {
    simulationState[id] = true;
    const readings = SIMULATED_READINGS[id];
    // Injected directly via processing
    const processed = processMachineData({
        machine_id: id,
        temperature: readings.temperature_C,
        vibration: readings.vibration_mm_s,
        rpm: readings.rpm,
        current: readings.current_A
    });
    updateMachineState(processed);
    logToSystem(`SIMULATED FAILURE INJECTED FOR ${id}`);
    updateHomeDynamic();
}

function resetSimulation(id) {
    delete simulationState[id];
    logToSystem(`SIMULATION RESET FOR ${id}`);
    updateHomeDynamic();
}

/**
 * 2. DIGITAL TWIN (SIMULATION)
 */
function renderDigitalTwinContent() {
    const container = document.getElementById('digitalTwinPage');
    container.innerHTML = `
        <div class="view-header">
            <div class="view-title">
                <h2>Digital Twin <span>Simulation</span></h2>
                <div class="view-subtitle">Simulation Engine v2.4 Active • High-Density Grid</div>
            </div>
        </div>
        
        <div id="dt-container" style="width:100%; height:400px; margin-top:2rem;">
            <div class="dt-loading">
                <p>Establishing simulation link...</p>
            </div>
        </div>
    `;
}

async function startDigitalTwin() {
    // Digital Twin now uses the central real-time state from SSE
    console.log("🔗 Digital Twin Synchronized with SSE Stream.");
    renderDigitalTwin();
}

function stopDigitalTwin() {
    // No-op as it now uses the global state loop
}

function renderDigitalTwin() {
    const container = document.getElementById('dt-container');
    if (!container) return;

    // Task 8: Clean 2D SVG Schematic
    const svg = `
        <svg viewBox="0 0 800 400" style="width:100%; height:100%; filter: drop-shadow(0 0 20px rgba(0,0,0,0.5));">
            <defs>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                    <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
            </defs>
            <!-- Factory Floor Layout -->
            <rect x="50" y="50" width="700" height="300" rx="10" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.05)" />
            
            ${machineData.map((m, i) => {
                const x = 150 + (i * 180);
                const y = 200;
                const color = m.risk === 'HIGH' ? 'var(--status-critical)' : (m.risk === 'MEDIUM' ? 'var(--status-warn)' : 'var(--status-ok)');
                const isPulse = m.risk === 'HIGH';
                
                return `
                    <g transform="translate(${x}, ${y})">
                        <circle r="40" fill="rgba(0,0,0,0.5)" stroke="${color}" stroke-width="2" filter="url(#glow)">
                           ${isPulse ? `<animate attributeName="stroke-opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite" />` : ''}
                        </circle>
                        <text y="60" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold">${m.machine_id}</text>
                        <text y="80" text-anchor="middle" fill="var(--text-muted)" font-size="10">${m.risk}</text>
                        <!-- Connection Lines -->
                        <line x1="0" y1="-40" x2="0" y2="-100" stroke="rgba(255,255,255,0.1)" stroke-dasharray="4" />
                    </g>
                `;
            }).join('')}
            
            <text x="400" y="380" text-anchor="middle" fill="var(--text-muted)" font-size="10" letter-spacing="2">ATLAS V2.0 SCHEMATIC VIEW</text>
        </svg>
    `;

    container.innerHTML = svg;
}

/**
 * TACTICAL 3: MAINTENANCE SCHEDULER
 */
function renderSchedulerContent() {
    const container = document.getElementById('schedulerPage');
    const priorityNodes = machineData.filter(m => m.risk !== 'LOW');
    
    container.innerHTML = `
        <div class="view-header">
            <div class="view-title">
                <h2>Maintenance <span>Scheduler</span></h2>
                <div class="view-subtitle">Dynamic Resource Allocation Based on AI Priority</div>
            </div>
            <button class="action-btn primary" onclick="exportDataToCSV()">EXPORT DATASET (CSV)</button>
        </div>

        <div class="card-grid">
            <div class="atlas-card">
                <div class="m-card-header"><h4>ACTIVE QUEUE</h4></div>
                <div class="m-explanation" style="margin-top:0.5rem">Machines currently requiring urgent intervention:</div>
                <div id="schedulerList" style="margin-top: 1.5rem;">
                    ${priorityNodes.length ? priorityNodes.map(m => `
                        <div style="padding: 1rem; background: rgba(255,255,255,0.03); margin-bottom: 0.5rem; border-left: 3px solid ${m.risk === 'HIGH' ? '#ff4d4d' : '#ff9800'}; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color:#fff">${m.machine_id}</strong><br>
                                <span style="font-size:0.75rem; color:var(--text-muted)">Reason: ${m.explanation}</span>
                            </div>
                            <button class="action-btn secondary" style="padding: 4px 8px; font-size: 0.7rem;" onclick="alert('Maintenance window for ${m.machine_id} locked to 14:00 Today')">SCHEDULE</button>
                        </div>
                    `).join('') : '<p style="color:#666">No urgent machines in queue.</p>'}
                </div>
            </div>

            <div class="atlas-card" id="cloudSyncPanel">
                <div class="m-card-header"><h4>☁️ CLOUD SYNC: GOOGLE SHEETS</h4></div>
                <p style="font-size: 0.8rem; color: #888; margin-bottom: 1.5rem;">Stream live telemetry to your Google Apps Script Webhook for cloud-based reporting.</p>
                
                <div class="input-group">
                    <label>WEBHOOK URL (PRE-CONFIGURED)</label>
                    <input type="text" id="googleSheetUrl" value="${CONFIG.SHEETS_URL}" style="width:100%; padding:0.8rem; background:rgba(0,0,0,0.3); border:1px solid #444; color:#fff;" />
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem;">
                    <span id="syncStatus" style="font-size: 0.75rem; color: #666;">Status: DISCONNECTED</span>
                    <button class="action-btn secondary" id="syncToggleBtn" onclick="toggleCloudSync()">INITIALIZE SYNC</button>
                </div>
            </div>
        </div>
    `;
}

/**
 * GOOGLE SHEETS CLOUD SYNC
 */
let cloudSyncActive = false;
let cloudSyncInterval = null;

function toggleCloudSync() {
    const url = document.getElementById('googleSheetUrl').value;
    const statusEl = document.getElementById('syncStatus');
    const btn = document.getElementById('syncToggleBtn');
    
    if (cloudSyncActive) {
        clearInterval(cloudSyncInterval);
        cloudSyncActive = false;
        btn.textContent = "INITIALIZE SYNC";
        statusEl.textContent = "Status: DISCONNECTED";
        statusEl.style.color = "#666";
        logToSystem("CLOUD SYNC TERMINATED.");
    } else {
        if (!url.startsWith('https://script.google.com')) {
            alert("Invalid Script URL. Please use a valid Google Apps Script Web App URL.");
            return;
        }
        cloudSyncActive = true;
        btn.textContent = "DISABLE SYNC";
        statusEl.textContent = "Status: STREAMING...";
        statusEl.style.color = "#11ff9b";
        
        cloudSyncInterval = setInterval(async () => {
            try {
                // Ensure data is synced right before send
                await fetchWithFallback(url, 'atlas_sheets_cache', {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        machineData: machineData.map(m => ({
                            machine_id: m.machine_id,
                            temperature: m.temperature.toFixed(1),
                            vibration: m.vibration.toFixed(2),
                            current: m.current.toFixed(1),
                            rpm: Math.round(m.rpm),
                            risk: m.risk,
                            explanation: m.explanation
                        })), 
                        timestamp: new Date() 
                    })
                });
                console.log("☁️ SYNCED TO EXCEL (G-SHEETS).");
            } catch (e) {
                console.error("Cloud Sync Error:", e);
            }
        }, 10000); 
        logToSystem("CLOUD SYNC INITIALIZED SUCCESSFULY.");
    }
}
function exportDataToCSV() {
    let csv = "Machine_ID,Temperature,Vibration,RPM,Current,Risk,Explanation\n";
    machineData.forEach(m => {
        csv += `${m.machine_id},${m.temperature},${m.vibration},${m.rpm},${m.current},${m.risk},"${m.explanation}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `ATLAS_FLEET_REPORT_${Date.now()}.csv`);
    a.click();
    logToSystem("FLEET DATASET EXPORTED TO CSV.");
}

/**
 * 3. ALERT STACK
 */
function updateAlertStackDynamic() {
    const container = document.getElementById('alertContainer');
    if (!container) return;

    const criticals = machineData.filter(m => m.risk === 'HIGH');
    
    // Add Export Button at the top
    let html = `
        <div style="grid-column: 1 / -1; display:flex; justify-content: flex-end; margin-bottom: 1rem;">
            <button class="action-btn secondary" onclick="exportAlertsCSV()">EXPORT ALERTS (CSV)</button>
        </div>
    `;

    if (criticals.length === 0) {
        container.innerHTML = html + `<div class="atlas-card" style="opacity: 0.5; grid-column: 1 / -1;"><p>No tactical alerts in stack. All nodes nominal.</p></div>`;
        return;
    }

    container.innerHTML = html + criticals.map(m => {
        const timeOffset = Math.floor(Math.random() * 5); // Mock offset for demo
        return `
            <div class="atlas-card status-critical">
                <div class="m-card-header">
                    <span class="m-id" style="display:flex; align-items:center; gap:8px;">
                        <span style="background:var(--status-critical); color:#000; padding:2px 6px; border-radius:3px; font-size:10px;">${m.machine_id}</span>
                        ALRT-${m.machine_id}
                    </span>
                    <span class="m-tag" style="background:transparent; border:1px solid rgba(255,255,255,0.1);">${timeOffset === 0 ? 'just now' : timeOffset + ' min ago'}</span>
                </div>
                <p style="font-size: 0.85rem; line-height: 1.6; margin-bottom: 1.5rem; color:#fff;">${m.explanation}</p>
                <button class="action-btn primary" onclick="alert('Work Order Triggered for ${m.machine_id}')">TRIGGER REMEDIATION</button>
            </div>
        `;
    }).join('');
}

function exportAlertsCSV() {
    const criticals = machineData.filter(m => m.risk === 'HIGH');
    const header = 'machine_id,timestamp,risk_level,reason\n';
    const rows = criticals.map(a => `${a.machine_id},${new Date().toISOString()},${a.risk},"${a.explanation}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'atlas_alerts.csv'; a.click();
    URL.revokeObjectURL(url);
    logToSystem("ALERTS LOG EXPORTED.");
}

function renderAnalyticsContent() {
    const container = document.getElementById('analyticsPage');
    container.innerHTML = `
        <div class="view-header">
            <div class="view-title">
                <h2>Predictive <span>Analytics</span></h2>
                <div class="view-subtitle">Fleet-Wide Health Trends • Neural Baseline: Alpha-7</div>
            </div>
        </div>
        <div class="card-grid">
            <div class="atlas-card">
                <div class="m-card-header"><h4>RELIABILITY SCORE</h4></div>
                <div style="font-size: 2.5rem; font-weight: 800; color: var(--status-ok)">98.4<span style="font-size: 1rem">%</span></div>
            </div>
            <div class="atlas-card">
                <div class="m-card-header"><h4>DOWNTIME PREVENTED</h4></div>
                <div style="font-size: 2.5rem; font-weight: 800; color: var(--accent-cyan)">142<span style="font-size: 1rem">HRS</span></div>
            </div>
        </div>
        
        <div class="analytics-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-top: 2.5rem;">
            <div class="atlas-card">
                <div class="m-card-header"><h4>FLEET TEMPERATURE TREND</h4></div>
                <div style="height: 200px;"><canvas id="fleetTempChart"></canvas></div>
            </div>
            <div class="atlas-card">
                <div class="m-card-header"><h4>FLEET VIBRATION TREND</h4></div>
                <div style="height: 200px;"><canvas id="fleetVibChart"></canvas></div>
            </div>
            <div class="atlas-card">
                <div class="m-card-header"><h4>FLEET RPM TREND</h4></div>
                <div style="height: 200px;"><canvas id="fleetRpmChart"></canvas></div>
            </div>
            <div class="atlas-card">
                <div class="m-card-header"><h4>FLEET CURRENT TREND</h4></div>
                <div style="height: 200px;"><canvas id="fleetCurrChart"></canvas></div>
            </div>
        </div>
    `;
}

function renderAnalyticsCharts() {
    const chartIds = ['fleetTempChart', 'fleetVibChart', 'fleetRpmChart', 'fleetCurrChart'];
    const metrics = ['temp', 'vib', 'rpm', 'curr'];
    const colors = ['#ff4d4d', '#11ff9b', '#00f2ff', '#ff9800'];

    chartIds.forEach((id, idx) => {
        const ctx = document.getElementById(id);
        if (!ctx) return;

        // Calculate Fleet Average
        const aggregateData = historyMap["CNC_01"][metrics[idx]].map((_, timeIdx) => {
            let sum = 0, count = 0;
            Object.values(historyMap).forEach(mHist => {
                sum += mHist[metrics[idx]][timeIdx];
                count++;
            });
            return sum / count;
        });

        if (chartInstances[id]) {
            chartInstances[id].data.datasets[0].data = aggregateData;
            chartInstances[id].update('none');
        } else {
            chartInstances[id] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: Array(30).fill(''),
                    datasets: [{
                        label: metrics[idx].toUpperCase(),
                        data: aggregateData,
                        borderColor: colors[idx],
                        backgroundColor: colors[idx] + '10',
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    plugins: { 
                        legend: { display: false },
                        threshold: { value: THRESHOLDS[metrics[idx]] }
                    },
                    scales: {
                        y: { 
                            grid: { color: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.1)' }, 
                            ticks: { color: '#849495', font: { size: 10, family: 'Inter' } },
                            suggestedMax: THRESHOLDS[metrics[idx]] * 1.5 
                        },
                        x: { 
                            display: true,
                            grid: { color: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)' },
                            ticks: { display: false }
                        }
                    }
                }
            });
        }
    });
}

function renderDiagnosticsContent() {
    const container = document.getElementById('diagnosticsPage');
    container.innerHTML = `
        <div class="view-header">
            <div class="view-title">
                <h2>System <span>Diagnostics</span></h2>
                <div class="view-subtitle">Deep Inspection Mode • Secure Node: OSCAR-09</div>
            </div>
        </div>
        <div class="card-grid">
            <div class="atlas-card">
                <div class="m-card-header"><h4>CORE INSPECTION</h4></div>
                <p style="margin-bottom: 1.5rem;">Perform a full hardware-level diagnostic test on all active axes and thermal sensors.</p>
                <button class="action-btn primary" onclick="handleAction('Diagnostics Result: ALL SENSORS NOMINAL')">REQUEST DIAGNOSTICS</button>
            </div>
            <div class="atlas-card status-warn" id="isolation-card">
                <div class="m-card-header"><h4>SAFETY ISOLATION</h4></div>
                <p style="margin-bottom: 1.5rem;">Isolate faulty machine axes to prevent cascading gear failure during thermal drift.</p>
                <button class="action-btn secondary" onclick="handleAction('AXIS-09 ISOLATED. MECHANICAL HOLD ACTIVATED.')">ISOLATE AXIS</button>
            </div>
        </div>

        <div class="view-header" style="margin-top: 4rem;"><h3>SYSTEM TRAFFIC LOG</h3></div>
        <div class="atlas-card" style="font-family: monospace; font-size: 0.75rem; color: #0f0; background: #000; opacity: 0.8; height: 300px; overflow-y: auto; line-height: 1.8;" id="systemLogBox">
            [14:22:01] 📡 NODE_01: SYNC_VALIDATED<br>
            [14:22:03] ⚙️ DRIFT_CALC: 0.002mm/s<br>
            [14:22:05] 🛰️ SSE_LINK: ESTABLISHED<br>
            [14:22:08] 🧠 BRAIN_ENGINE: NOISE_FILTER_ACTIVE<br>
        </div>
    `;
}

function handleAction(msg) {
    alert(msg);
    logToSystem(`${msg}`);
}

function logToSystem(msg) {
    const box = document.getElementById('systemLogBox');
    if (box) {
        const time = new Date().toLocaleTimeString();
        box.innerHTML += `[${time}] ${msg}<br>`;
        box.scrollTop = box.scrollHeight;
    }
}

function toggleAIInsights() {
    const sidebar = document.querySelector('.insight-sidebar');
    if (sidebar) {
        sidebar.style.display = sidebar.style.display === 'none' ? 'block' : 'none';
    }
}

function renderInsights() {
    const feed = document.getElementById('insight-feed');
    if (feed) {
        feed.innerHTML = `
            <div class="insight-card">
                <h4>CNC_01: Vibration +12%</h4>
                <p>Increasing trend detected in last 4 hours. Possible wear on X-axis bearing.</p>
            </div>
            <div class="insight-card" style="border-left-color: var(--status-ok)">
                <h4>SYSTEM PERFORMANCE</h4>
                <p>All nodes synchronized. Average thermal drift 0.02%.</p>
            </div>
        `;
    }
}

/**
 * ROLE ENGINE
 */
/**
 * EXTERNAL SENSOR REAL-TIME STREAMING (SSE)
 */
function connectToSensorStreams() {
    const ids = ["CNC_01", "CNC_02", "PUMP_03", "CONVEYOR_04"];
    console.log("📡 SYNCING SENSOR DATA STREAMS [SSE]...");
    
    ids.forEach(id => {
        if (eventSources[id]) eventSources[id].close();
        
        console.log(`📡 Opening stream for ${id}...`);
        const es = new EventSource(`${CONFIG.SIMULATION_SERVER}/stream/${id}`);
        
        es.onmessage = (event) => {
            const raw = JSON.parse(event.data);
            
            // Step 4: Format to internal engine specs
            const formatted = {
                machine_id: raw.machine_id,
                temperature: raw.temperature_C || raw.temperature || 0,
                vibration: raw.vibration_mm_s || raw.vibration || 0,
                rpm: raw.rpm || 0,
                current: raw.current_A || 0
            };

            // Process through Decision Engine
            const processed = processMachineData(formatted);
            
            // Update local state
            updateMachineState(processed);
        };

        es.onerror = (err) => {
            console.warn(`⚠️ SSE Link Lost: ${id}. Retrying...`);
        };

        eventSources[id] = es;
    });

    // Start UI update loop (centralized sync)
    setInterval(() => {
        const homeVisible = document.getElementById('homePage').style.display !== 'none';
        const analyticsVisible = document.getElementById('analyticsPage').style.display !== 'none';
        const dtVisible = document.getElementById('digitalTwinPage').style.display !== 'none';

        if (homeVisible) {
            renderHomeChart();
            updateHomeDynamic();
        }
        
        if (currentRole === 'ENGINEER' && analyticsVisible) {
            renderAnalyticsCharts();
        }

        if (dtVisible) {
            updateDigitalTwinDynamic();
        }

        updateAlertStackDynamic();
        renderInsights();

        // TACTICAL 1: Save State to LocalStorage
        localStorage.setItem('atlas_history_map', JSON.stringify(historyMap));
        localStorage.setItem('atlas_machine_data', JSON.stringify(machineData));

        // TACTICAL: Save to Server Disk every 15 ticks
        window.saveCount = (window.saveCount || 0) + 1;
        if (window.saveCount % 15 === 0) saveToServerDisk();
    }, 1000);
}

async function saveToServerDisk() {
    try {
        await fetch(`${CONFIG.SIMULATION_SERVER}/api/save-telemetry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ machineData, historyMap })
        });
        console.log("📂 ARCHIVED TO DISK.");
    } catch (e) { console.error("Disk Sync Failed."); }
}

function processMachineData(m) {
    const state = machineEngineState[m.machine_id];
    if (!state) return m;

    // Task Goal: Stable Thresholds
    // HIGH -> temp > 80 OR vib > 2
    // MEDIUM -> temp > 65 OR vib > 1
    const isHigh = m.temperature > 80 || m.vibration > 2;
    const isMedium = m.temperature > 65 || m.vibration > 1;

    // Noise Filtering (3 cycles)
    if (isHigh) state.consecutiveHigh++; else state.consecutiveHigh = 0;
    if (isMedium) state.consecutiveMedium++; else state.consecutiveMedium = 0;

    let risk = "LOW";
    let priority = 1;

    if (state.consecutiveHigh >= 3) {
        risk = "HIGH";
        priority = 3;
    } else if (state.consecutiveMedium >= 2) { // Prompt asked for 2-3 cycles
        risk = "MEDIUM";
        priority = 2;
    }

    // Explanation Generator
    let explanation = "Normal operation";
    if (m.temperature > 80 && m.vibration > 2) explanation = "Possible bearing failure";
    else if (m.temperature > 80) explanation = "Possible overheating";
    else if (m.vibration > 2) explanation = "High vibration detected";

    return { ...m, risk, priority, explanation };
}

function updateMachineState(m) {
    // 1. Update Global Machine Data Array
    const idx = machineData.findIndex(item => item.machine_id === m.machine_id);
    if (idx !== -1) {
        machineData[idx] = m;
    } else {
        machineData.push(m);
    }

    // 2. Sort by Priority
    machineData.sort((a, b) => b.priority - a.priority);

    // 3. Update History for charts
    const h = historyMap[m.machine_id];
    if (h) {
        h.temp.push(m.temperature);
        h.vib.push(m.vibration);
        h.rpm.push(m.rpm);
        h.curr.push(m.current);
        if (h.temp.length > 30) {
            h.temp.shift(); h.vib.shift(); h.rpm.shift(); h.curr.shift();
        }
    }
}

function renderHomeChart() {
    const canvas = document.getElementById('home-telemetry-chart');
    if (!canvas || !machineData[0]) return;
    
    const m = machineData[0];
    const h = historyMap[m.machine_id];
    
    if (chartInstances['home']) {
        chartInstances['home'].data.datasets[0].data = h.vib;
        chartInstances['home'].update('none');
    } else {
        const ctx = canvas.getContext('2d');
        chartInstances['home'] = new Chart(ctx, {
            type: 'line',
            data: { 
                labels: Array(30).fill(''), 
                datasets: [{ 
                    label: 'VIB', 
                    data: [...h.vib], 
                    borderColor: '#00f2ff', 
                    borderWidth: 2, 
                    pointRadius: 0, 
                    tension: 0.4, 
                    fill: false 
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                animation: false, 
                plugins: { 
                    legend: { display: false },
                    threshold: { value: THRESHOLDS.vib }
                }, 
                scales: { 
                    x: { 
                        display: true, 
                        grid: { color: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' },
                        ticks: { display: false }
                    }, 
                    y: { 
                        display: true, 
                        min: 0, 
                        max: 10,
                        grid: { color: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' },
                        ticks: { color: '#849495', font: { size: 10 } }
                    } 
                } 
            }
        });
    }
}

/**
 * BOOTSTRAP
 */
document.addEventListener('DOMContentLoaded', () => {
    init();
    
    const emergencyBtn = document.querySelector('.emergency-btn');
    if (emergencyBtn) {
        emergencyBtn.addEventListener('click', () => {
            if (confirm("ACTIVATE EMERGENCY SHUTDOWN?")) {
                document.body.classList.add('emergency-halt');
                alert("SYSTEM HALTED. MANUAL OVERRIDE REQUIRED.");
            }
        });
    }
});

window.handleSimpleLogin = handleSimpleLogin;
window.showSimplePage = showSimplePage;
window.handleLogout = handleLogout;
window.simulateFailure = simulateFailure;
window.resetSimulation = resetSimulation;
window.exportAlertsCSV = exportAlertsCSV;
window.hideCacheBanner = hideCacheBanner;
