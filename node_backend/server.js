const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

// REQ: Static assets serving
app.use('/static', express.static(path.join(__dirname, '../public')));

// Persistent state for Noise Filter (simulate condition repeats)
const machineState = {
    "CNC_01": { highCount: 0 },
    "CNC_02": { highCount: 0 },
    "CNC_03": { highCount: 0 },
    "CNC_04": { highCount: 0 },
    "CNC_05": { highCount: 0 }
};

// Sample Data (REQ: Process machine data from sample)
const BASE_MACHINES = [
    { machine_id: "CNC_01", temperature: 85, vibration: 2.1 },
    { machine_id: "CNC_02", temperature: 70, vibration: 1.2 },
    { machine_id: "CNC_03", temperature: 68, vibration: 2.5 },
    { machine_id: "CNC_04", temperature: 55, vibration: 0.8 },
    { machine_id: "CNC_05", temperature: 92, vibration: 3.2 }
];

/**
 * REQ: Risk Calculation + Noise Filter + Explanation
 */
function processMachineInsights(m) {
    const isHighCondition = m.temperature > 80 || m.vibration > 2;
    const isMediumCondition = m.temperature > 65 || m.vibration > 1;

    // 2. NOISE FILTER: Only mark HIGH if condition repeats 3 times
    if (isHighCondition) {
        machineState[m.machine_id].highCount++;
    } else {
        machineState[m.machine_id].highCount = 0; // Reset if condition breaks
    }

    let risk = "LOW";
    let priority = 3;

    if (machineState[m.machine_id].highCount >= 3) {
        risk = "HIGH";
        priority = 1;
    } else if (isMediumCondition) {
        risk = "MEDIUM";
        priority = 2;
    }

    // 3. EXPLANATION
    let explanation = "Operating within expected parameters";
    const highTemp = m.temperature > 80;
    const highVib = m.vibration > 2;

    if (highTemp && highVib) {
        explanation = "Possible bearing failure due to high vibration and temperature";
    } else if (highTemp) {
        explanation = "Possible overheating detected";
    } else if (highVib) {
        explanation = "Possible imbalance or wear detected";
    } else if (risk === "MEDIUM") {
        explanation = "Thermal trend above baseline, monitor performance";
    }

    return {
        ...m,
        risk,
        explanation,
        priority
    };
}

/**
 * REQ: GET /machines
 */
app.get('/api/machines', (req, res) => {
    // Simulate real-time fluctuations
    const liveData = BASE_MACHINES.map(m => ({
        ...m,
        temperature: m.temperature + (Math.random() * 4 - 2),
        vibration: Number((m.vibration + (Math.random() * 0.4 - 0.2)).toFixed(2))
    }));

    const processed = liveData.map(processMachineInsights);

    // 4. PRIORITY SORT: HIGH -> MEDIUM -> LOW
    const sorted = processed.sort((a, b) => a.priority - b.priority);

    res.json({ machines: sorted });
});

// Root Response
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
    console.log(`ATLAS+ Node Backend running at http://localhost:${PORT}`);
    console.log(`Serving static assets from ../public/`);
});
