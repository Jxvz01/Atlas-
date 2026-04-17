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

/**
 * INITIALIZATION
 */
async function init() {
    const token = localStorage.getItem('atlas_token');
    const user = JSON.parse(localStorage.getItem('atlas_user') || '{}');
    
    if (!token) {
        document.getElementById('login-container').style.display = 'flex';
        document.querySelector('.app-container').style.display = 'none';
        return;
    }

    currentRole = user.role || "ENGINEER";
    const roleIndicator = document.getElementById('roleIndicator');
    if (roleIndicator) roleIndicator.textContent = currentRole;

    renderRoleUI();

    // Initialize History Map with empty buckets for external machines
    ["CNC_01", "CNC_02", "PUMP_03", "CONVEYOR_04"].forEach(id => {
        historyMap[id] = {
            temp: Array(30).fill(0),
            vib: Array(30).fill(0),
            rpm: Array(30).fill(0),
            curr: Array(30).fill(0)
        };
    });

    // Hide login, show app
    document.getElementById('login-container').style.display = 'none';
    document.querySelector('.app-container').style.display = 'flex';

    connectToSensorStreams();
    showPage('homePage');
}

/**
 * AUTHENTICATION LOGIC
 */
async function handleLogin() {
    const userEl = document.getElementById('username');
    const passEl = document.getElementById('password');
    const errEl = document.getElementById('auth-error');
    
    const username = userEl.value;
    const password = passEl.value;

    errEl.textContent = "SYNCHRONIZING...";

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            localStorage.setItem('atlas_token', data.token);
            localStorage.setItem('atlas_user', JSON.stringify(data.user));
            currentRole = data.user.role;
            const roleIndicator = document.getElementById('roleIndicator');
            if (roleIndicator) roleIndicator.textContent = currentRole;
            
            renderRoleUI();
            init();
        } else {
            errEl.textContent = data.message;
        }
    } catch (error) {
        errEl.textContent = "CRITICAL: AUTH SERVER OFFLINE";
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

    const tabs = {
        'homePage': 'homeTab',
        'digitalTwinPage': 'digitalTab',
        'alertStackPage': 'alertsTab',
        'analyticsPage': 'analyticsTab'
    };
    
    document.querySelectorAll('.view-links a').forEach(tab => tab.classList.remove('active'));
    const activeTabId = tabs[pageId];
    if (activeTabId) document.getElementById(activeTabId).classList.add('active');

    if (pageId === 'homePage') {
        setTimeout(renderHomeChart, 50);
    }

    if (pageId === 'analyticsPage' && currentRole === 'ENGINEER') {
        setTimeout(renderAnalyticsCharts, 50);
    }

    if (pageId === 'digitalTwinPage') startDigitalTwin();
    else stopDigitalTwin();
}

function renderRoleUI() {
    const sidebar = document.getElementById('sidebarMenu');
    const topNav = document.getElementById('topNav');
    if (!sidebar || !topNav) return;

    if (currentRole === 'ENGINEER') {
        sidebar.innerHTML = `
            <a href="#" class="nav-item active" id="overviewBtn" onclick="handleSidebarNav('homePage', 'overview', 'overviewBtn')">OVERVIEW</a>
            <a href="#" class="nav-item" id="analBtn" onclick="showPage('analyticsPage')">ANALYTICS</a>
            <a href="#" class="nav-item" id="riskBtn" onclick="handleSidebarNav('homePage', 'riskMatrix', 'riskBtn')">RISK MATRIX</a>
        `;
        topNav.innerHTML = `
            <a href="#" class="active" id="homeTab" onclick="showPage('homePage')">HOME</a>
            <a href="#" id="digitalTab" onclick="showPage('digitalTwinPage')">DIGITAL TWIN</a>
            <a href="#" id="analyticsTab" onclick="showPage('analyticsPage')">ANALYTICS</a>
        `;
    } else {
        sidebar.innerHTML = `
            <a href="#" class="nav-item active" id="teleBtn" onclick="handleSidebarNav('homePage', 'telemetry', 'teleBtn')">TELEMETRY</a>
            <a href="#" class="nav-item" id="diagBtn" onclick="showPage('diagnosticsPage')">DIAGNOSTICS</a>
            <a href="#" class="nav-item" id="alertBtn" onclick="showPage('alertStackPage')">ALERT STACK</a>
        `;
        topNav.innerHTML = `
            <a href="#" class="active" id="homeTab" onclick="showPage('homePage')">HOME</a>
            <a href="#" id="digitalTab" onclick="showPage('digitalTwinPage')">DIGITAL TWIN</a>
            <a href="#" id="alertsTab" onclick="showPage('alertStackPage')">ALERT STACK</a>
        `;
    }
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
    renderHomeContent();
    renderDigitalTwinContent();
    renderAlertStackContent();
    renderAnalyticsContent();
}

/**
 * 1. MONITORING DASHBOARD (HOME)
 */
function renderHomeContent() {
    const m = machineData[0] || { machine_id: "N/A", temperature: 0, vibration: 0 };
    const container = document.getElementById('homePage');
    container.innerHTML = `
        <div id="overview" class="view-header">
            <div class="view-title">
                <h2>Operational <span>Intelligence</span></h2>
                <div class="view-subtitle">System Node: OSCAR-09 • Pulse Synchronized</div>
            </div>
        </div>

        <div id="telemetry" class="telemetry-focus">
            <div class="focus-header"><h3>LIVE TELEMETRY STREAM</h3></div>
            <div class="big-chart-wrap"><canvas id="home-telemetry-chart"></canvas></div>
        </div>

        <div id="riskMatrix" class="card-grid">
            <div class="atlas-card status-ok">
                <div class="m-card-header">
                    <span class="m-id">FLEET_STATUS</span>
                    <span class="m-tag">NOMINAL</span>
                </div>
                <div class="m-stats">
                    <div class="m-metric">
                        <label>ACTIVE NODES</label>
                        <div class="val">${machineData.length}</div>
                    </div>
                    <div class="m-metric">
                        <label>NETWORK LATENCY</label>
                        <div class="val">12<span>ms</span></div>
                    </div>
                </div>
            </div>

            <div class="atlas-card status-warn">
                <div class="m-card-header">
                    <span class="m-id">PREDICTIVE_LOAD</span>
                    <span class="m-tag">BALANCE</span>
                </div>
                <div class="m-stats">
                    <div class="m-metric">
                        <label>THROUGHPUT</label>
                        <div class="val">94<span>%</span></div>
                    </div>
                    <div class="m-metric">
                        <label>UPTIME</label>
                        <div class="val">99.9<span>%</span></div>
                    </div>
                </div>
            </div>
        </div>
    `;
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
        
        <div id="digitalTwinContainer" class="card-grid">
            <div class="dt-loading">
                <p>Establishing simulation link...</p>
            </div>
        </div>
    `;
}

async function startDigitalTwin() {
    const container = document.getElementById('digitalTwinContainer');
    if (!container || dtInterval) return;

    const fetchDT = async () => {
        try {
            const response = await fetch('/api/machines');
            const data = await response.json();
            renderDTModules(data.machines);
        } catch (e) {
            container.innerHTML = `<p class="dt-error">Simulation link offline</p>`;
        }
    };

    fetchDT();
    dtInterval = setInterval(fetchDT, 2000);
}

function stopDigitalTwin() {
    if (dtInterval) {
        clearInterval(dtInterval);
        dtInterval = null;
    }
}

function renderDTModules(machines) {
    const container = document.getElementById('digitalTwinContainer');
    if (!container) return;

    const STATUS_MAP = {
        'LOW': { label: 'NOMINAL', icon: '◎', class: 'status-ok' },
        'MEDIUM': { label: 'CAVITATION_RISK', icon: '△', class: 'status-warn' },
        'HIGH': { label: 'THERMAL_RUNAWAY', icon: '!', class: 'status-critical' }
    };

    const html = machines.map(m => {
        const s = STATUS_MAP[m.risk] || STATUS_MAP['LOW'];
        return `
            <div class="atlas-card ${s.class}">
                <div class="m-card-header">
                    <span class="m-id">${m.machine_id}</span>
                    <span class="m-tag">${s.label}</span>
                </div>
                <div class="m-stats">
                    <div class="m-metric">
                        <label>TEMPERATURE</label>
                        <div class="val">${m.temperature.toFixed(1)}<span>°C</span></div>
                    </div>
                    <div class="m-metric">
                        <label>VIBRATION</label>
                        <div class="val">${m.vibration.toFixed(2)}<span>mm/s</span></div>
                    </div>
                    <div class="m-metric">
                        <label>RPM</label>
                        <div class="val">${m.rpm.toFixed(0)}</div>
                    </div>
                    <div class="m-metric">
                        <label>CURRENT</label>
                        <div class="val">${m.current.toFixed(1)}<span>A</span></div>
                    </div>
                </div>
                <div class="m-footer">
                    <div class="m-risk">
                        <label>RISK_ASSESSMENT</label>
                        <div class="risk-val">${m.risk}</div>
                    </div>
                    <div class="m-icon" style="font-size: 1.5rem; opacity: 0.3;">${s.icon}</div>
                </div>
                <div class="m-explanation">"${m.explanation}"</div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

/**
 * 3. ALERT STACK
 */
function renderAlertStackContent() {
    const container = document.getElementById('alertStackPage');
    container.innerHTML = `
        <div class="view-header"><h2>Tactical <span>Alerts</span></h2></div>
        <div class="card-grid">
            <div class="atlas-card status-critical">
                <div class="m-card-header">
                    <span class="m-id">ALRT-901</span>
                    <span class="m-tag">CRITICAL</span>
                </div>
                <p style="font-size: 0.85rem; line-height: 1.6; margin-bottom: 1.5rem;">
                    Thermal Runaway protection triggered on Node-09. Cooling flow below baseline.
                </p>
                <button class="action-btn primary" onclick="alert('Work Order Triggered')">TRIGGER REMEDIATION</button>
            </div>
        </div>
    `;
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

        // Destroy previous to avoid memory leaks
        if (chartInstances[id]) chartInstances[id].destroy();

        // Calculate Fleet Average of the metric
        const aggregateData = historyMap["CNC_01"][metrics[idx]].map((_, timeIdx) => {
            let sum = 0;
            let count = 0;
            Object.values(historyMap).forEach(mHist => {
                sum += mHist[metrics[idx]][timeIdx];
                count++;
            });
            return sum / count;
        });

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
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#666' } },
                    x: { display: false }
                }
            }
        });
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
        <div class="atlas-card status-warn" style="max-width: 600px;">
            <div class="m-card-header"><h4>MANUAL SYNC OVERRIDE</h4></div>
            <p style="margin-bottom: 1.5rem;">Force a hardware-level diagnostic sync on all active nodes. This will bypass standard polling cycles.</p>
            <div style="display: flex; gap: 1rem;">
                <button class="action-btn primary" onclick="alert('Initiating Core Sync...')">FORCE SYNC</button>
                <button class="action-btn secondary" onclick="alert('Clearing Neural Cache...')">CLEAR CACHE</button>
            </div>
        </div>
    `;
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
    
    ids.forEach(id => {
        if (eventSources[id]) eventSources[id].close();
        
        console.log(`📡 Opening stream for ${id}...`);
        const es = new EventSource(`http://localhost:3000/stream/${id}`);
        
        es.onmessage = (event) => {
            const raw = JSON.parse(event.data);
            
            // Step 4: Format to internal engine specs
            const formatted = {
                machine_id: raw.machine_id,
                temperature: raw.temperature_C,
                vibration: raw.vibration_mm_s,
                rpm: raw.rpm,
                current: raw.current_A
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

    // Start UI update loop (faster than SSE for smooth charts)
    setInterval(() => {
        if (document.getElementById('homePage').style.display !== 'none') {
            renderHomeChart();
        }
        if (currentRole === 'ENGINEER' && document.getElementById('analyticsPage').style.display === 'block') {
            renderAnalyticsCharts();
        }
        populateAllPages();
        renderInsights();
    }, 1000);
}

function processMachineData(m) {
    const state = machineEngineState[m.machine_id];
    if (!state) return m;

    // DECISION ENGINE: MULTI-SIGNAL ANALYSIS
    const rpmDropRatio = (state.rpmBaseline - m.rpm) / state.rpmBaseline;
    const isRpmDropSignificant = rpmDropRatio > 0.20;
    const isRpmInstable = rpmDropRatio > 0.10;
    
    const h = historyMap[m.machine_id];
    const prevCurrent = h && h.curr.length > 0 ? h.curr[h.curr.length - 1] : m.current;
    const isCurrentSpike = m.current > (prevCurrent * 1.3);

    const isHighCondition = (m.temperature > 80 && m.vibration > 2) || isRpmDropSignificant || isCurrentSpike;
    const isMediumCondition = m.temperature > 65 || m.vibration > 1 || isRpmInstable;

    // NOISE FILTER
    if (isHighCondition) state.consecutiveHigh++; else state.consecutiveHigh = 0;
    if (isMediumCondition) state.consecutiveMedium++; else state.consecutiveMedium = 0;

    let risk = "LOW";
    let priority = 1;

    if (state.consecutiveHigh >= 3) {
        risk = "HIGH";
        priority = 3;
    } else if (state.consecutiveMedium >= 3) {
        risk = "MEDIUM";
        priority = 2;
    }

    // EXPLANATION ENGINE
    let explanation = "Machine operating within normal conditions";
    if (risk === "HIGH") {
        if (m.temperature > 80 && m.vibration > 2) explanation = "Bearing wear likely due to sustained vibration and heat";
        else if (isRpmDropSignificant) explanation = "Critical RPM drop: Possible mechanical blockage or load issue";
        else if (isCurrentSpike) explanation = "Electrical overload detected: Sudden current spike";
    } else if (risk === "MEDIUM") {
        if (m.temperature > 65) explanation = "Thermal trend above baseline, monitor intake flow";
        else if (m.vibration > 1) explanation = "Slight vibration instability detected in housing";
        else if (isRpmInstable) explanation = "RPM fluctuation detected: Load balance shift";
    }

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
                plugins: { legend: { display: false } }, 
                scales: { x: { display: false }, y: { display: false, min: 0, max: 10 } } 
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

window.showPage = showPage;
window.handleSidebarNav = handleSidebarNav;
window.handleLogout = handleLogout;
window.handleLogin = handleLogin;
