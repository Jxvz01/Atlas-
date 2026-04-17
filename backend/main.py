from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from simulation import MachineState, simulate_machines

app = FastAPI(title="ATLAS+ Digital Twin Full-Stack Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simulation State Configuration
MACHINES = [
    MachineState(machine_id="M-101", base_temperature=45.0, base_vibration=1.2),
    MachineState(machine_id="M-102", base_temperature=48.0, base_vibration=1.8),
    MachineState(machine_id="M-103", base_temperature=52.0, base_vibration=2.1),
    MachineState(machine_id="M-104", base_temperature=57.0, base_vibration=2.5),
    MachineState(machine_id="M-105", base_temperature=60.0, base_vibration=3.0),
]

@app.get("/api/machines")
def get_machines():
    return {"machines": simulate_machines(MACHINES)}

# Static Assets Mounting
# We will move frontend files to the 'public' folder
if os.path.exists("public"):
    app.mount("/static", StaticFiles(directory="public"), name="static")

@app.get("/")
def read_root():
    return FileResponse("public/index.html")

@app.get("/health")
def health_check():
    return {"status": "ATLAS+ Core Server Active", "version": "2.4.0"}

