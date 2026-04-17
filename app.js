let machineData = [];
let chartInstances = {};
let historyMap = {};

/**
 * INITIALIZATION
 */
async function init() {
    try {
        const response = await fetch('data.json');
        machineData = await response.json();
        
        machineData.forEach(m => {
            historyMap[m.machine_id] = {
                temp: Array(30).fill(m.temperature),
                vib: Array(30).fill(m.vibration)
            };
        });

        populateAllPages();
        renderInsights();
        startSimulation();
        
        // REQ: "Home" is the default landing page
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
 * (Moved from original Digital Twin content)
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

        <div id="aiInsights" class="focus-header" style="margin-bottom: 2rem;">
            <h3>AI SENTINEL FORECAST</h3>
            <p style="color:var(--text-muted); font-size:0.75rem; margin-top:0.5rem; text-align: right;">"Spectral analysis indicates 94% probability of bearing fatigue in sector 7 within 22 operating hours."</p>
        </div>

        <div id="systemLog" class="telemetry-focus" style="padding: 2rem;">
            <div class="focus-header"><h3>DIAGNOSTIC EVENT LOG</h3></div>
            <div style="font-family: monospace; font-size: 0.75rem; color: var(--text-muted); line-height: 2;">
                [15:42:01] SECURE UPDATER: Node-09 heartbeat sync established.<br>
                [15:42:04] VIBRATION_DAEMON: Micro-spike detected in AXIS-Y (+0.4mm/s).
            </div>
        </div>
    `;
}

/**
 * 2. DIGITAL TWIN PAGE: INTEGRATION PLACEHOLDER
 */
function renderDigitalTwinContent() {
    const container = document.getElementById('digitalTwinPage');
    container.innerHTML = `
        <div class="view-header">
            <div class="view-title">
                <h2>Digital Twin <span>Simulation</span></h2>
                <div class="view-subtitle">Simulation Engine Integration Port</div>
            </div>
        </div>
        
        <div class="telemetry-focus" style="height: 500px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(0,0,0,0.2); border: 2px dashed rgba(0,242,255,0.1); border-radius: 12px;">
            <div id="digitalTwinContainer">
                <div style="text-align: center;">
                    <div class="tag-predictive" style="margin-bottom: 1rem; display: inline-block;">RESERVED FOR INTEGRATION</div>
                    <h3 style="color: white; margin-bottom: 0.5rem;">Digital Twin Simulation</h3>
                    <p style="color: var(--text-muted);">Loading simulation engine...</p>
                </div>
            </div>
        </div>
    `;
}

function renderAlertStackContent() {
    const container = document.getElementById('alertStackPage');
    container.innerHTML = `
        <div id="overview" class="view-header"><h2>Smart <span>Prioritization</span></h2></div>
        <div id="telemetry" class="threat-stack">
            <div class="stack-card critical">
                <div class="stack-info"><h3>Thermal Runaway Protection</h3><p>Immediate mitigation required.</p></div>
                <div class="stack-actions"><button class="call-to-action primary">TRIGGER WORK ORDER</button></div>
            </div>
        </div>
    `;
}

function renderAnalyticsContent() {
    const container = document.getElementById('analyticsPage');
    container.innerHTML = `<div id="overview" class="view-header"><h2>Operational <span>Analytics</span></h2></div>`;
}

function renderDiagnosticsContent() {
    const container = document.getElementById('diagnosticsPage');
    container.innerHTML = `<div id="overview" class="view-header"><h2>System <span>Diagnostics</span></h2></div>`;
}

function renderInsights() {
    const feed = document.getElementById('insight-feed');
    if (!feed) return;
    feed.innerHTML = `<div class="insight-card predictive"><h4>CNC_01: Vibration +12%</h4><button class="action-btn">REQUEST DIAGNOSTICS</button></div>`;
}

/**
 * SIMULATION ENGINE
 */
function startSimulation() {
    setInterval(() => {
        machineData.forEach(m => {
            m.temperature += (Math.random() - 0.5) * 2;
            m.vibration += (Math.random() - 0.5) * 0.4;
            const h = historyMap[m.machine_id];
            h.temp.push(m.temperature); h.vib.push(m.vibration);
            if (h.temp.length > 30) { h.temp.shift(); h.vib.shift(); }
        });
        updateLiveValues();
        if (document.getElementById('homePage').style.display !== 'none') {
            renderHomeChart();
        }
    }, 2000);
}

function updateLiveValues() {
    machineData.forEach(m => {
        document.querySelectorAll(`.live-temp-${m.machine_id}`).forEach(el => el.textContent = `${m.temperature.toFixed(1)}°C`);
    });
}

function renderHomeChart() {
    const canvas = document.getElementById('home-telemetry-chart');
    if (!canvas) return;
    const m = machineData[0];
    const h = historyMap[m.machine_id];
    if (chartInstances['home']) {
        const c = chartInstances['home'];
        c.data.datasets[0].data = h.vib.map(v => v + Math.sin(Date.now()/800) * 0.3);
        c.update('none');
    } else {
        const ctx = canvas.getContext('2d');
        chartInstances['home'] = new Chart(ctx, {
            type: 'line',
            data: { labels: Array(30).fill(''), datasets: [{ label: 'VIB', data: [...h.vib], borderColor: '#00f2ff', borderWidth: 2, pointRadius: 0, tension: 0.6, fill: false }] },
            options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false, min: 0, max: 9 } } }
        });
    }
}

/**
 * EVENT LISTENERS
 */
function initEventListeners() {
    document.getElementById('overviewBtn').addEventListener('click', () => handleSidebarScroll('overview', 'overviewBtn'));
    document.getElementById('telemetryBtn').addEventListener('click', () => handleSidebarScroll('telemetry', 'telemetryBtn'));
    
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
