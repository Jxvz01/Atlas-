const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

// REQ: Static assets serving
app.use(express.static(path.join(__dirname, '../public')));
app.use('/static', express.static(path.join(__dirname, '../public')));

// Persistent state for Predictive Decision Engine
const machineState = {
    "CNC_01": { consecutiveHigh: 0, consecutiveMedium: 0, rpmBaseline: 1500, rpmHistory: [], currentHistory: [] },
    "CNC_02": { consecutiveHigh: 0, consecutiveMedium: 0, rpmBaseline: 1800, rpmHistory: [], currentHistory: [] },
    "PUMP_03": { consecutiveHigh: 0, consecutiveMedium: 0, rpmBaseline: 3000, rpmHistory: [], currentHistory: [] },
    "CONVEYOR_04": { consecutiveHigh: 0, consecutiveMedium: 0, rpmBaseline: 800, rpmHistory: [], currentHistory: [] }
};

// Base Data with expanded signals
const BASE_MACHINES = [
    { machine_id: "CNC_01", temperature: 45, vibration: 0.8, rpm: 1500, current: 8.5 },
    { machine_id: "CNC_02", temperature: 52, vibration: 1.2, rpm: 1800, current: 12.0 },
    { machine_id: "PUMP_03", temperature: 48, vibration: 0.9, rpm: 3000, current: 7.2 },
    { machine_id: "CONVEYOR_04", temperature: 40, vibration: 0.5, rpm: 800, current: 15.4 }
];

/**
 * ADVANCED DECISION ENGINE: MULTI-SIGNAL ANALYSIS
 */
function processMachineInsights(m) {
    const state = machineState[m.machine_id];
    
    // Track trends (keeping last 5 for analysis)
    state.rpmHistory.push(m.rpm);
    state.currentHistory.push(m.current);
    if (state.rpmHistory.length > 5) state.rpmHistory.shift();
    if (state.currentHistory.length > 5) state.currentHistory.shift();

    // Signal Detection
    const rpmDropRatio = (state.rpmBaseline - m.rpm) / state.rpmBaseline;
    const isRpmDropSignificant = rpmDropRatio > 0.20;
    const isRpmInstable = rpmDropRatio > 0.10;
    
    const prevCurrent = state.currentHistory[state.currentHistory.length - 2] || m.current;
    const isCurrentSpike = m.current > (prevCurrent * 1.3); // 30% sudden increase

    // RISK CONDITIONS
    const isHighCondition = (m.temperature > 80 && m.vibration > 2) || isRpmDropSignificant || isCurrentSpike;
    const isMediumCondition = m.temperature > 65 || m.vibration > 1 || isRpmInstable;

    // STEP 4: NOISE FILTER (3 consecutive readings)
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

    // STEP 5: EXPLANATION ENGINE
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

    return {
        ...m,
        risk,
        explanation,
        priority
    };
}

/**
 * REQ: GET /api/machines
 */
app.get('/api/machines', (req, res) => {
    // Simulate real-time signal fluctuations
    const liveData = BASE_MACHINES.map(m => {
        // Occasionally trigger anomalies for the user to see the engine in action
        const anomalyTrigger = Math.random() > 0.95; 
        return {
            ...m,
            temperature: m.temperature + (Math.random() * 10 - 2) + (anomalyTrigger ? 30 : 0),
            vibration: Number((m.vibration + (Math.random() * 0.5 - 0.1) + (anomalyTrigger ? 1.5 : 0)).toFixed(2)),
            rpm: m.rpm - (Math.random() * 50) - (anomalyTrigger ? 400 : 0),
            current: Number((m.current + (Math.random() * 1.5 - 0.5) + (anomalyTrigger ? 8 : 0)).toFixed(2))
        };
    });

    const processed = liveData.map(processMachineInsights);

    // STEP 6: PRIORITY SORT (HIGH -> MEDIUM -> LOW)
    const sorted = processed.sort((a, b) => b.priority - a.priority);

    res.json({ machines: sorted });
});

// Root Response
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

/**
 * REQ: Auth Module (Added for Tactical Integration)
 */
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    // STRICT Role-based credentials (Exactly one per role)
    if (username === 'engineer' && password === 'eng123') {
        res.json({ 
            success: true, 
            token: 'atlas_eng_mock_8812',
            user: { role: 'ENGINEER', name: 'Field Engineer' }
        });
    } else if (username === 'technician' && password === 'tech123') {
        res.json({ 
            success: true, 
            token: 'atlas_tech_mock_2291',
            user: { role: 'TECHNICIAN', name: 'Maintenance Tech' }
        });
    } else {
        res.status(401).json({ success: false, message: 'CRITICAL: ACCESS DENIED. UNAUTHORIZED ROLE OR KEY.' });
    }
});

app.listen(PORT, () => {
    console.log(`ATLAS+ Node Backend running at http://localhost:${PORT}`);
    console.log(`Serving static assets from ../public/`);
});
