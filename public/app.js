let machineData = [];
let chartInstances = {};
let historyMap = {};
let dtInterval = null;

/**
 * INITIALIZATION
 */
async function init() {
    try {
        // REQ: Connect to the same dataset (backend API)
        const response = await fetch('/api/machines');
        const data = await response.json();
        machineData = data.machines;
        
        machineData.forEach(m => {
            historyMap[m.machine_id] = {
                temp: Array(30).fill(m.temperature),
                vib: Array(30).fill(m.vibration)
            };
        });

        populateAllPages();
        renderInsights();
        startGlobalSimulation();
        
        showPage('homePage');
    } catch (error) {
        console.error("Error loading machine data:", error);
    }
}

/**
 * NAVIGATION ROUTER
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
        'analyticsPage': 'analyticsTab',
        'diagnosticsPage': 'diagnosticsTab'
    };
    
    document.querySelectorAll('.view-links a').forEach(tab => tab.classList.remove('active'));
    const activeTabId = tabs[pageId];
    if (activeTabId) document.getElementById(activeTabId).classList.add('active');

    // Chart persistence logic for Home page
    if (pageId === 'homePage') {
        setTimeout(renderHomeChart, 50);
    }

    // REQ: Ensure it does NOT run in background when other tabs are active
    if (pageId === 'digitalTwinPage') {
        startDigitalTwin();
    } else {
        stopDigitalTwin();
    }
}

function handleSidebarScroll(targetId, btnId) {
    const target = document.getElementById(targetId);
    if (target) target.scrollIntoView({ behavior: 'smooth' });
    document.querySelectorAll('.nav-menu .nav-item').forEach(item => item.classList.remove('active'));
    document.getElementById(btnId).classList.add('active');
}

/**
 * PAGE RENDERING
 */
function populateAllPages() {
    renderHomeContent();
    renderDigitalTwinContent();
    renderAlertStackContent();
    renderAnalyticsContent();
    renderDiagnosticsContent();
}

/**
 * 1. HOME PAGE: THE MAIN MONITORING DASHBOARD
 */
function renderHomeContent() {
    const m = machineData[0] || { machine_id: "N/A", temperature: 106.8, vibration: 0.082 };
    const container = document.getElementById('homePage');
    container.innerHTML = `
        <div id="overview" class="view-header">
            <div class="view-title">
                <h2>Operational <span>Overview</span></h2>
                <div class="view-subtitle"><span>System Node: Node-09</span> • <span>Heartbeat Stable</span></div>
            </div>
            <div class="view-metrics">
                <div class="metric-badge"><div class="m-label">Risk Score</div><div class="m-value">12<span>/100</span></div></div>
            </div>
        </div>

        <div id="telemetry" class="telemetry-focus">
            <div class="focus-header"><h3>MACHINE FLEET TELEMETRY</h3></div>
            <div class="big-chart-wrap"><canvas id="home-telemetry-chart"></canvas></div>
        </div>

        <div id="riskMatrix" class="metric-row" style="margin-bottom: 3rem;">
            <div class="metric-card">
                <div class="card-data">
                    <h4>THERMAL BUFFER</h4>
                    <div class="val live-temp-${m.machine_id}">${m.temperature.toFixed(1)}°C</div>
                    <div class="sub">NOMINAL</div>
                </div>
            </div>
            <div class="metric-card">
                <div class="card-data">
                    <h4>LOAD TORQUE</h4>
                    <div class="val">1,240<span> Nm</span></div>
                    <div class="sub">STABLE</div>
                </div>
            </div>
            <div class="metric-card" style="border-left: 2px solid var(--accent-red)">
                <div class="card-data">
                    <h4 style="color: var(--accent-red)">DRIFT FACTOR</h4>
                    <div class="val">0.082<span>σ</span></div>
                    <div class="sub" style="color: var(--accent-red)">ELEVATED</div>
                </div>
            </div>
        </div>
    `;
}

/**
 * 2. DIGITAL TWIN PAGE: INTEGRATED SIMULATION
 */
function renderDigitalTwinContent() {
    const container = document.getElementById('digitalTwinPage');
    container.innerHTML = `
        <div class="view-header">
            <div class="view-title">
                <h2>Digital Twin <span>Simulation</span></h2>
                <div class="view-subtitle">Simulation Engine v2.4 Active</div>
            </div>
        </div>
        
        <div id="digitalTwinContainer" class="dt-grid-container">
            <div class="dt-loading">
                <div class="tag-predictive">INITIALIZING CORE</div>
                <p>Loading simulation engine...</p>
            </div>
        </div>
    `;
}

/**
 * DIGITAL TWIN MODULE INTEGRATION
 * (Ported from recently merged simulation logic)
 */
async function startDigitalTwin() {
    const container = document.getElementById('digitalTwinContainer');
    if (!container) return;

    // REQ: Performance - Prevent duplicate rendering
    if (dtInterval) return;

    const fetchDT = async () => {
        try {
            const response = await fetch('/api/machines');
            if (!response.ok) throw new Error("Simulation link unstable");
            const data = await response.json();
            renderDTModules(data.machines);
        } catch (error) {
            // REQ: Error Handling
            container.innerHTML = `
                <div class="dt-error">
                    <div class="tag-predictive" style="background: var(--accent-red)">SIMULATION FAILURE</div>
                    <p>Internal link failed: ${error.message}</p>
                </div>
            `;
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
        0: { label: 'NOMINAL', icon: '◎', class: 'status-ok' },
        1: { label: 'CAVITATION_RISK', icon: '△', class: 'status-warn' },
        2: { label: 'THERMAL_RUNAWAY', icon: '!', class: 'status-critical' }
    };

    const html = machines.map(m => {
        const status = STATUS_MAP[m.status] || STATUS_MAP[0];
        return `
            <div class="dt-card ${status.class}">
                <div class="dt-card-header">
                    <span class="dt-machine-tag">${m.machine_id}</span>
                    <span class="dt-status-label">${status.label}</span>
                </div>
                <div class="dt-card-body">
                    <div class="dt-metric">
                        <label>TEMPERATURE</label>
                        <div class="val">${m.temperature}<span>°C</span></div>
                    </div>
                    <div class="dt-metric">
                        <label>VIBRATION</label>
                        <div class="val">${m.vibration}<span>mm/s</span></div>
                    </div>
                </div>
                <div class="dt-card-footer">
                    <div class="dt-risk">
                        <label>RISK_SCORE</label>
                        <div class="risk-val">${m.risk_score}</div>
                    </div>
                    <div class="dt-status-icon">${status.icon}</div>
                </div>
                <div class="dt-explanation">"${m.explanation}"</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="dt-simulation-grid">${html}</div>`;
}

function renderAlertStackContent() {
    const container = document.getElementById('alertStackPage');
    container.innerHTML = `
        <div class="view-header"><h2>Smart <span>Prioritization</span></h2></div>
        <div class="threat-stack">
            <div class="stack-card critical">
                <div class="stack-info"><h3>Thermal Runaway Protection</h3><p>Immediate mitigation required.</p></div>
                <div class="stack-actions"><button class="call-to-action primary">TRIGGER WORK ORDER</button></div>
            </div>
        </div>
    `;
}

function renderAnalyticsContent() {
    const container = document.getElementById('analyticsPage');
    container.innerHTML = `<div class="view-header"><h2>Operational <span>Analytics</span></h2></div>`;
}

function renderDiagnosticsContent() {
    const container = document.getElementById('diagnosticsPage');
    container.innerHTML = `<div class="view-header"><h2>System <span>Diagnostics</span></h2></div>`;
}

function renderInsights() {
    const feed = document.getElementById('insight-feed');
    if (!feed) return;
    feed.innerHTML = `<div class="insight-card predictive"><h4>CNC_01: Vibration +12%</h4><button class="action-btn">REQUEST DIAGNOSTICS</button></div>`;
}

/**
 * GLOBAL TELEMETRY ENGINE (Simplified Home Chart Sync)
 */
function startGlobalSimulation() {
    setInterval(async () => {
        try {
            const response = await fetch('/api/machines');
            const data = await response.json();
            machineData = data.machines;
            
            machineData.forEach(m => {
                const h = historyMap[m.machine_id];
                if (h) {
                    h.temp.push(m.temperature); h.vib.push(m.vibration);
                    if (h.temp.length > 30) { h.temp.shift(); h.vib.shift(); }
                }
            });
            
            updateLiveValues();
            if (document.getElementById('homePage').style.display !== 'none') {
                renderHomeChart();
            }
        } catch (e) {
            console.error("Telemetry sync failed", e);
        }
    }, 2000);
}

function updateLiveValues() {
    if (machineData[0]) {
        const m = machineData[0];
        document.querySelectorAll(`.live-temp-${m.machine_id}`).forEach(el => el.textContent = `${m.temperature.toFixed(1)}°C`);
    }
}

function renderHomeChart() {
    const canvas = document.getElementById('home-telemetry-chart');
    if (!canvas) return;
    const m = machineData[0];
    if (!m) return;
    const h = historyMap[m.machine_id];
    if (chartInstances['home']) {
        const c = chartInstances['home'];
        c.data.datasets[0].data = h.vib;
        c.update('none');
    } else {
        const ctx = canvas.getContext('2d');
        chartInstances['home'] = new Chart(ctx, {
            type: 'line',
            data: { labels: Array(30).fill(''), datasets: [{ label: 'VIB', data: [...h.vib], borderColor: '#00f2ff', borderWidth: 2, pointRadius: 0, tension: 0.6, fill: false }] },
            options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false, min: 0, max: 10 } } }
        });
    }
}

/**
 * EVENT LISTENERS
 */
function initEventListeners() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const text = btn.textContent.trim().toUpperCase();
        if (text === 'REQUEST DIAGNOSTICS') alert("Diagnostics requested");
        else if (text === 'TRIGGER WORK ORDER') alert("Work order created");
    });

    const emergencyBtn = document.querySelector('.emergency-btn');
    if (emergencyBtn) {
        emergencyBtn.addEventListener('click', () => {
            if (confirm("ACTIVATE EMERGENCY STOP?")) {
                document.body.classList.add('emergency-halt');
                alert("SYSTEM HALTED.");
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    init();
    initEventListeners();
});

window.showPage = showPage;
window.handleSidebarScroll = handleSidebarScroll;
