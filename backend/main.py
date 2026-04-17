from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from simulation import MachineState, simulate_machines

app = FastAPI(title="ATLAS+ Digital Twin Simulation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


MACHINES = [
    MachineState(machine_id="M-101", base_temperature=45.0, base_vibration=1.2),
    MachineState(machine_id="M-102", base_temperature=48.0, base_vibration=1.8),
    MachineState(machine_id="M-103", base_temperature=52.0, base_vibration=2.1),
    MachineState(machine_id="M-104", base_temperature=57.0, base_vibration=2.5),
    MachineState(machine_id="M-105", base_temperature=60.0, base_vibration=3.0),
]


@app.get("/machines")
def get_machines():
    return {"machines": simulate_machines(MACHINES)}


@app.get("/")
def health_check():
    return {"message": "ATLAS+ Digital Twin Simulation API is running"}

