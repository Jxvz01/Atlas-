# ATLAS+ Digital Twin Simulation System

This project is a full-stack digital twin simulation for an industrial dashboard.

## Project Structure

- `backend/` - FastAPI service with machine simulation logic
- `frontend/` - React + Vanilla CSS dashboard UI

## Backend Setup (FastAPI)

1. Open terminal in `backend/`
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Start server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### Backend API

- `GET /machines` - Returns simulated real-time machine data for 5 machines

Each response includes:
- `machine_id`
- `temperature`
- `vibration`
- `status` (`0` normal, `1` warning, `2` critical)
- `status_color` (`Green`, `Yellow`, `Red`)
- `risk_score` (0-100)
- `explanation`

## Frontend Setup (React + Vite)

1. Open terminal in `frontend/`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start development server:
   ```bash
   npm run dev
   ```
4. Open the local URL shown in terminal (typically `http://localhost:5173`)

## Simulation Rules

- Normal:
  - Temperature: 40-60
  - Vibration: 1-3
- Warning:
  - Temperature increases by 5-10
- Critical:
  - Temperature increases by 15-25
  - Vibration doubles

## Risk Calculation

```text
risk = (temperature deviation * 2 + vibration * 10)
```

- `temperature deviation` is measured from baseline temperature 50
- Risk score is clamped to 0-100

## UI Features

- Polls backend every 2 seconds
- Displays 5 live machine cards
- Color-coded border by status:
  - Green = Normal
  - Yellow = Warning
  - Red = Critical
- Shows explanation text for anomaly conditions
