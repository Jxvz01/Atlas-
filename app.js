let machineData = [];
let currentView = 'engineer'; // engineer (Digital Twin) | technician (Alert Stack)
let chartInstances = {};
let historyMap = {};

// Initialize machine history for charts
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

        renderDashboard();
        renderInsights();
        startSimulation();
    } catch (error) {
        console.error("Error loading machine data:", error);
    }
}

// Data Simulation
function startSimulation() {
    setInterval(() => {
        machineData.forEach(m => {
            // Realistic drift
            const shiftT = (Math.random() - 0.5) * 4;
            const shiftV = (Math.random() - 0.5) * 0.6;
            
            m.temperature = Math.max(30, Math.min(110, m.temperature + shiftT));
            m.vibration = Math.max(0.1, Math.min(7, m.vibration + shiftV));

            // Update history
            const h = historyMap[m.machine_id];
            h.temp.push(m.temperature);
            h.vib.push(m.vibration);
            if (h.temp.length > 30) {
                h.temp.shift();
                h.vib.shift();
            }
        });
        
        updateLiveValues();
        renderCharts();
    }, 2000);
}

function updateLiveValues() {
    machineData.forEach(m => {
        const tempEls = document.querySelectorAll(`.live-temp-${m.machine_id}`);
        tempEls.forEach(el => el.textContent = `${m.temperature.toFixed(1)}°C`);
    });
}

function switchView(view) {
    currentView = view;
    
    // UI Feedback for Nav
    document.getElementById('engLink').classList.toggle('active', view === 'engineer');
    document.getElementById('techLink').classList.toggle('active', view === 'technician');
    
    renderDashboard();
    renderCharts();
}

function renderDashboard() {
    const container = document.getElementById('main-content');
    if (!container) return;

    if (currentView === 'engineer') {
        renderEngineerMode(container);
    } else {
        renderTechnicianMode(container);
    }
}

function renderEngineerMode(container) {
    const m = machineData[0]; // Focus on primary machine
    
    container.innerHTML = `
        <div class="view-header">
            <div class="view-title">
                <h2>Digital Twin <span>Engine</span></h2>
                <div class="view-subtitle">
                    <span>CNC_01 Hybrid Reality Sync</span>
                    <span>•</span>
                    <span>Latency 4ms</span>
                </div>
            </div>
            <div class="view-metrics">
                <div class="metric-badge">
                    <div class="m-label">Risk Score</div>
                    <div class="m-value">12<span>/100</span></div>
                </div>
                <div class="metric-badge">
                    <div class="m-label">Anomaly Timer</div>
                    <div class="m-value">00:04:12</div>
                </div>
            </div>
        </div>

        <div class="telemetry-focus">
            <div class="focus-header">
                <h3>Vibration Baseline Analysis</h3>
            </div>
            <div class="big-chart-wrap">
                <canvas id="big-telemetry-chart"></canvas>
            </div>
        </div>

        <div class="metric-row">
            <div class="metric-card">
                <div class="metric-icon">🌡️</div>
                <div class="card-data">
                    <h4>Thermal Buffer</h4>
                    <div class="val live-temp-${m.machine_id}">${m.temperature.toFixed(1)}°C</div>
                    <div class="sub">
                        <span>NOMINAL</span>
                        <span>LIMIT: 95°C</span>
                    </div>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-icon">⚡</div>
                <div class="card-data">
                    <h4>Load Torque</h4>
                    <div class="val">1,240<span> Nm</span></div>
                    <div class="sub">
                        <span>STABLE</span>
                        <span>PEAK: 1,800 Nm</span>
                    </div>
                </div>
            </div>
            <div class="metric-card" style="border-left: 2px solid var(--accent-red)">
                <div class="metric-icon" style="color: var(--accent-red)">📉</div>
                <div class="card-data">
                    <h4 style="color: var(--accent-red)">Drift Factor</h4>
                    <div class="val">0.082<span>σ</span></div>
                    <div class="sub">
                        <span style="color:var(--accent-red); font-weight:800">ELEVATED VIBRATION DETECTED</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    renderCharts();
}

function renderTechnicianMode(container) {
    container.innerHTML = `
        <div class="view-header">
            <div class="view-title">
                <h2>Smart <span>Prioritization</span></h2>
                <div class="view-subtitle">
                    <span>Tactical overlay ranking critical system failures by immediate business impact and mechanical urgency.</span>
                </div>
            </div>
            <div class="view-metrics">
                <div class="metric-badge">
                    <div class="m-label">Operator Trust</div>
                    <div class="m-value">42<span> Temporary Spikes</span></div>
                </div>
            </div>
        </div>

        <div class="threat-stack">
            <div class="stack-card critical">
                <div class="stack-info">
                    <div class="m-label" style="color: var(--accent-red)">CRITICAL • ID: TK-9844-B</div>
                    <h3>Thermal Runaway: Primary Injector #4</h3>
                    <p>Vibration patterns in the secondary casing suggest imminent structural failure. Projected business impact: <b>$12,400/hr</b> in downtime.</p>
                    <div class="stack-stats">
                        <div class="s-metric"><div class="l">Urgency</div><div class="v" style="color: var(--accent-red)">04m 12s to Failure</div></div>
                        <div class="s-metric"><div class="l">Confidence</div><div class="v">98.4%</div></div>
                    </div>
                </div>
                <div class="stack-actions">
                    <button class="call-to-action primary">TRIGGER WORK ORDER</button>
                    <button class="call-to-action secondary">ACKNOWLEDGE</button>
                </div>
            </div>

            <div class="stack-card priority">
                <div class="stack-info">
                    <div class="m-label" style="color: var(--accent-cyan)">PRIORITY • ID: PR-1120-X</div>
                    <h3>Lubricant Viscosity Degradation</h3>
                    <p>Main bearing assembly showing 15% increase in friction coefficient. Early maintenance will prevent long-term scoring of the shaft.</p>
                </div>
                <div class="stack-actions">
                    <button class="call-to-action secondary">SCHEDULE REPAIR</button>
                    <button class="call-to-action secondary">DISMISS</button>
                </div>
            </div>
        </div>
    `;
}

function renderInsights() {
    const feed = document.getElementById('insight-feed');
    if (!feed) return;

    feed.innerHTML = `
        <div class="insight-card predictive">
            <div class="card-meta">
                <span class="tag-predictive">PREDICTIVE</span>
                <span>2m ago</span>
            </div>
            <h4>CNC_01: Vibration 12% above baseline</h4>
            <p>Root cause identified as spindle bearing wear in sector 4. Maintenance advised within 48 operational hours.</p>
            <button class="action-btn">REQUEST DIAGNOSTICS</button>
        </div>
        <div class="insight-card critical">
            <div class="card-meta">
                <span class="tag-critical">CRITICAL</span>
                <span>15m ago</span>
            </div>
            <h4>Thermal Drift detected in AXIS-Y</h4>
            <p>Consistent deviation of +4.2% from calibrated thermal profile. Potential cooling manifold blockage.</p>
            <button class="action-btn primary">ISOLATE AXIS</button>
            <button class="icon-btn" style="position:absolute; top:1.5rem; right:1rem">✖</button>
        </div>
    `;
}

function renderCharts() {
    if (currentView !== 'engineer') {
        if (chartInstances['big']) {
            chartInstances['big'].destroy();
            delete chartInstances['big'];
        }
        return;
    }

    const canvas = document.getElementById('big-telemetry-chart');
    if (!canvas) return;

    const m = machineData[0];
    const history = historyMap[m.machine_id];

    if (chartInstances['big']) {
        const chart = chartInstances['big'];
        chart.data.datasets[0].data = history.vib.map(v => v + Math.sin(Date.now()/800) * 0.3);
        chart.data.datasets[1].data = history.vib.map(v => v * 0.7 + Math.cos(Date.now()/800) * 0.4);
        chart.update('none');
    } else {
        const ctx = canvas.getContext('2d');
        chartInstances['big'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(30).fill(''),
                datasets: [
                    {
                        label: 'ACTUAL',
                        data: [...history.vib],
                        borderColor: '#00f2ff',
                        borderWidth: 3,
                        pointRadius: 0,
                        tension: 0.6,
                        fill: false
                    },
                    {
                        label: 'PREDICTED',
                        data: [...history.vib],
                        borderColor: 'rgba(255,255,255,0.05)',
                        borderDash: [8, 4],
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.6,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { 
                        display: false,
                        min: 0,
                        max: 9
                    }
                }
            }
        });
    }
}

// Global Initialization
document.addEventListener('DOMContentLoaded', init);
window.switchView = switchView;
