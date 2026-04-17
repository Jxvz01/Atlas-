let machineData = [];
let chartInstances = {};
let historyMap = {};
let dtInterval = null;
let currentRole = "ENGINEER";

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

    try {
        const response = await fetch('/api/machines');
        const data = await response.json();
        machineData = data.machines;
        
        machineData.forEach(m => {
            historyMap[m.machine_id] = {
                temp: Array(30).fill(m.temperature),
                vib: Array(30).fill(m.vibration),
                rpm: Array(30).fill(m.rpm),
                curr: Array(30).fill(m.current)
            };
        });

        // Hide login, show app
        document.getElementById('login-container').style.display = 'none';
        document.querySelector('.app-container').style.display = 'flex';

        populateAllPages();
        renderInsights();
        startGlobalSimulation();
        
        showPage('homePage');
    } catch (error) {
        console.error("Critical: Telemetry link failed", error);
    }
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

    if (pageId === 'digitalTwinPage') startDigitalTwin();
    else stopDigitalTwin();
}

function handleSidebarScroll(targetId, btnId) {
    const target = document.getElementById(targetId);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
        document.querySelectorAll('.nav-menu .nav-item').forEach(item => item.classList.remove('active'));
        document.getElementById(btnId).classList.add('active');
    }
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
    container.innerHTML = `<div class="view-header"><h2>Predictive <span>Analytics</span></h2></div>`;
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
function startGlobalSimulation() {
    setInterval(async () => {
        try {
            const response = await fetch('/api/machines');
            const data = await response.json();
            machineData = data.machines;
            
            machineData.forEach(m => {
                const h = historyMap[m.machine_id];
                if (h) {
                    h.temp.push(m.temperature); 
                    h.vib.push(m.vibration);
                    h.rpm.push(m.rpm);
                    h.curr.push(m.current);
                    if (h.temp.length > 30) { 
                        h.temp.shift(); 
                        h.vib.shift(); 
                        h.rpm.shift(); 
                        h.curr.shift(); 
                    }
                }
            });
            
            if (document.getElementById('homePage').style.display !== 'none') {
                renderHomeChart();
            }
        } catch (e) {
            console.error("Link failure", e);
        }
    }, 2000);
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
window.handleSidebarScroll = handleSidebarScroll;
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
