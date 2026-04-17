import { useEffect, useState } from "react";

const API_URL = "http://127.0.0.1:8000/machines";

const STATUS_LABELS = {
  0: "Normal",
  1: "Warning",
  2: "Critical",
};

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
        <h1>ATLAS+ Digital Twin Simulation Dashboard</h1>
        <p>Live machine telemetry updates every 2 seconds.</p>
      </header>

      {error && <p className="error-banner">{error}</p>}

      <section className="card-grid">
        {machines.map((machine) => (
          <article
            key={machine.machine_id}
            className={`machine-card status-${machine.status}`}
          >
            <h2>{machine.machine_id}</h2>
            <p>
              <span>Temperature:</span> {machine.temperature} °C
            </p>
            <p>
              <span>Vibration:</span> {machine.vibration}
            </p>
            <p>
              <span>Status:</span> {STATUS_LABELS[machine.status] || "Normal"} (
              {machine.status_color})
            </p>
            <p>
              <span>Risk Score:</span> {machine.risk_score}
            </p>
            <p>
              <span>Explanation:</span> {machine.explanation}
            </p>
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
