import { useEffect, useState } from "react";

const API_URL = "http://127.0.0.1:8000/machines";

const STATUS_LABELS = {
  0: "Normal",
  1: "Warning",
  2: "Critical",
};

const STATUS_THEME = {
  0: {
    label: "NOMINAL",
    icon: "◎",
  },
  1: {
    label: "CAVITATION_RISK",
    icon: "△",
  },
  2: {
    label: "THERMAL_RUNAWAY",
    icon: "!",
  },
};

const MACHINE_TYPES = [
  "INDUSTRIAL_MILL",
  "PRECISION_LATHE",
  "HYDRAULIC_PUMP",
  "LOGISTICS_ARRAY",
  "THERMAL_CHAMBER",
];

function App() {
  const [machines, setMachines] = useState([]);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchMachines = async () => {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        throw new Error("Failed to fetch machine data");
      }
      const data = await response.json();
      setMachines(data.machines || []);
      setError("");
      setLastUpdated(new Date());
    } catch (fetchError) {
      setError(fetchError.message);
    }
  };

  useEffect(() => {
    fetchMachines();
    const intervalId = setInterval(fetchMachines, 2000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <h1>ATLAS+ DIGITAL TWIN</h1>
        <p>live signal refresh every 2s</p>
      </header>

      {error && <p className="error-banner">{error}</p>}

      <section className="card-grid">
        {machines.map((machine, index) => (
          <article key={machine.machine_id} className={`machine-card status-${machine.status}`}>
            <div className="card-top">
              <p className="status-line">
                STATUS: {STATUS_THEME[machine.status]?.label || STATUS_LABELS[machine.status] || "NOMINAL"}
              </p>
              <span className="machine-chip">{machine.machine_id}</span>
            </div>

            <div className="card-mid">
              <p className="micro-label">TYPE</p>
              <h2>{MACHINE_TYPES[index] || "INDUSTRIAL_NODE"}</h2>
            </div>

            <div className="telemetry-line">
              <span>TEMP {machine.temperature} C</span>
              <span>VIB {machine.vibration}</span>
            </div>

            <div className="card-bottom">
              <div>
                <p className="micro-label">RISK_SCORE</p>
                <p className="risk-value">{Number(machine.risk_score).toFixed(1)}</p>
              </div>
              <p className="status-icon">{STATUS_THEME[machine.status]?.icon || "◎"}</p>
            </div>

            <p className="explanation">{machine.explanation}</p>
          </article>
        ))}
      </section>

      <footer className="dashboard-footer">
        Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : "Never"}
      </footer>
    </main>
  );
}

export default App;
