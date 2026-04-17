from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Dict, List


NORMAL = 0
WARNING = 1
CRITICAL = 2


@dataclass
class MachineState:
    machine_id: str
    base_temperature: float
    base_vibration: float


def _pick_status() -> int:
    # Keep mostly normal with occasional warning/critical spikes.
    return random.choices(
        population=[NORMAL, WARNING, CRITICAL],
        weights=[0.7, 0.2, 0.1],
        k=1,
    )[0]


def _simulate_temperature(base_temperature: float, status: int) -> float:
    if status == WARNING:
        return base_temperature + random.uniform(5, 10)
    if status == CRITICAL:
        return base_temperature + random.uniform(15, 25)
    return base_temperature


def _simulate_vibration(base_vibration: float, status: int) -> float:
    if status == CRITICAL:
        return base_vibration * 2
    return base_vibration


def _build_explanation(status: int, temperature: float, vibration: float) -> str:
    if status == CRITICAL:
        if vibration >= 6:
            return "Extreme vibration detected, possible mechanical failure"
        return "Critical heat rise detected, urgent cooling inspection required"
    if status == WARNING:
        if temperature > 65:
            return "High temperature detected, possible overheating"
        return "Temperature trend above baseline, monitor performance"
    return "Operating within expected parameters"


def _calculate_risk(temperature: float, vibration: float) -> float:
    temperature_deviation = max(0.0, temperature - 50.0)
    risk = temperature_deviation * 2 + vibration * 10
    return max(0.0, min(100.0, risk))


def status_to_color(status: int) -> str:
    mapping = {
        NORMAL: "Green",
        WARNING: "Yellow",
        CRITICAL: "Red",
    }
    return mapping.get(status, "Green")


def simulate_machines(machine_states: List[MachineState]) -> List[Dict[str, float | int | str]]:
    result: List[Dict[str, float | int | str]] = []
    for machine in machine_states:
        status = _pick_status()
        temperature = round(_simulate_temperature(machine.base_temperature, status), 2)
        vibration = round(_simulate_vibration(machine.base_vibration, status), 2)
        risk_score = round(_calculate_risk(temperature, vibration), 2)
        explanation = _build_explanation(status, temperature, vibration)

        result.append(
            {
                "machine_id": machine.machine_id,
                "temperature": temperature,
                "vibration": vibration,
                "status": status,
                "status_color": status_to_color(status),
                "risk_score": risk_score,
                "explanation": explanation,
            }
        )
    return result

