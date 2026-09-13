# APEX PULSE — Formula 1 AI Race Strategy & Telemetry Command Center

> **Team Slipstream — Motorsport Intelligence Platform**  
> Real-time dual-model race strategy engine featuring PPO hybrid energy deployment, XGBoost overtake viability scoring, FIA hybrid compliance guardrails, and two-way WebRTC pit wall race radio communication.

---

## 🏎️ System Architecture

```
                                  [ F1 MONZA TELEMETRY / SIMULATION FEED ]
                                                     │ 20 Hz
                                                     ▼
                                        ┌─────────────────────────┐
                                        │     FASTAPI BACKEND     │
                                        │   (Inference Engine)    │
                                        └────────────┬────────────┘
                                                     │
                   ┌─────────────────────────────────┼─────────────────────────────────┐
                   ▼                                 ▼                                 ▼
         ┌───────────────────┐             ┌───────────────────┐             ┌───────────────────┐
         │     PPO MODEL     │             │   XGBOOST MODEL   │             │ COMPLIANCE GUARD  │
         │ Energy Management │             │ Overtake Scoring  │             │  FIA Regulations  │
         │  (Harvest/Push)   │             │ (Confidence/Zone) │             │ (Clipping Envelope│
         └─────────┬─────────┘             └─────────┬─────────┘             └─────────┬─────────┘
                   │                                 │                                 │
                   └─────────────────────────────────┼─────────────────────────────────┘
                                                     │ 20 Hz WebSocket (/ws)
                                                     ▼
                                        ┌─────────────────────────┐
                                        │    REACT VITE CLIENT    │
                                        │ (Dual Driver/Coach DDU) │
                                        └────────────┬────────────┘
                                                     │
                             ┌───────────────────────┴───────────────────────┐
                             ▼                                               ▼
                  ┌──────────────────────┐                       ┌──────────────────────┐
                  │   PIT WALL COACH     │  ◄── WebRTC Voice ──► │     DRIVER COCKPIT   │
                  │  Voice Radio Console │        (Audio)        │   MoTeC Display Unit │
                  └──────────────────────┘                       └──────────────────────┘
```

---

## 🌟 Core Features

1. **01 / Overview Telemetry Dashboard**:
   - **Lap Time Trend Graph**: Lap-by-lap pace progression with sector delta splits and current lap marker.
   - **Overtake Probability Graph**: Real-time opportunity curves with confidence envelopes and verified pass zones.
   - **Tyre Performance & Compound Degradation**: Multi-compound wear models (Soft, Medium, Hard) across 50 laps.
   - **Driver Performance Spider Radar**: 6-axis motorsport telemetry polygon (Braking, Throttle, Cornering, ERS, Overtake, Consistency).
   - **3-Column Command Center Toggle**: Instant switch to the live 3-column race view.

2. **02 / Driver Cockpit DDU (MoTeC Display)**:
   - MoTeC PCU-8D instrument cluster with 15-LED sequential shift array, gear display, delta timers, and pedal traces.
   - Incoming race radio notification banners with **`[ ACCEPT CALL ]`**, **`[ DECLINE ]`**, and **`[ END CALL ]`** controls.
   - Driver listening state confirmation (`DRIVER: LISTENING`).

3. **03 / Pit Wall Coach Console**:
   - Real-time WebRTC race radio console with **`[ CALL DRIVER ]`** and **`[ END CALL ]`**.
   - LIVE coach microphone audio broadcasting through an F1 intercom bandpass filter (300Hz–3400Hz).
   - Confirmed radio acknowledgment timeline (`SENT` → `DELIVERED` → `ACKNOWLEDGED` → `ACTION CONFIRMED`).

4. **04 / AI Strategy Engine**:
   - PPO Reinforcement Learning model for stint-level energy deployment (`HARVEST`, `BALANCE`, `PUSH`, `OVERTAKE`).
   - XGBoost classifier scoring real-time overtake viability percentage and expected value.

5. **05 / Live Telemetry Waveforms**:
   - High-frequency 20Hz telemetry traces for speed, battery SoC, gap to car ahead, and MGU-K electrical power.
   - 2D Monza circuit track radar with zero-fluctuation car movement.

6. **06 / Historical Laps & Kaggle Data**:
   - 50-Lap Monza Grand Prix dataset cross-referenced with official Kaggle F1 overtaking maneuver records.

---

## 🛠️ Tech Stack & Requirements

- **Frontend**: React 18, Vite 5, HTML5 Web Audio API, WebRTC RTCPeerConnection, SVG Data Visualizations
- **Backend**: Python 3.10+, FastAPI, Uvicorn, WebSockets, PyTorch, Stable-Baselines3, XGBoost, Scikit-learn, Pandas
- **Node.js**: v18.0.0 or higher
- **Python**: 3.10, 3.11, or 3.12

---

## 🚀 Quickstart (Local Development)

### 1. Clone Repository & Install Dependencies

```bash
# Backend Setup
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate
pip install -r requirements.txt

# Frontend Setup
cd ../apex_pulse/frontend
npm install
```

### 2. Run Local Servers

#### Option A: 1-Click Universal Windows Launcher
Double-click `RUN_ALL_APEX_PULSE.bat` in the repository root.

#### Option B: Manual Command Line
```bash
# Terminal 1: Backend
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Frontend
cd apex_pulse/frontend
npm run dev
```

Open your browser to:
- **Navigation View**: `http://localhost:5173`
- **All Dashboards Stacked**: `http://localhost:5173/#all`

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` in both `frontend` and `backend`.

### Backend Configuration (`backend/.env`)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `8000` | Port for the FastAPI server (injected by Render/Railway/Fly). |
| `HOST` | `0.0.0.0` | Interface to bind to. |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed frontend origins. |
| `FRONTEND_URL` | `http://localhost:5173` | Deployed frontend URL. |
| `TELEMETRY_MODE` | `synthetic` | `synthetic` (built-in 20Hz feed) or `udp` (EA Sports F1 UDP feed). |

### Frontend Configuration (`frontend/.env`)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `VITE_API_URL` | *(empty in dev)* | Public backend URL (e.g. `https://apex-pulse-api.onrender.com`). |
| `VITE_WS_URL` | *(auto-derived)* | Public WebSocket URL (e.g. `wss://apex-pulse-api.onrender.com/ws`). |
| `VITE_STUN_SERVER` | `stun:stun.l.google.com:19302` | STUN server for ICE negotiation. |
| `VITE_TURN_SERVER` | *(empty)* | Optional TURN server for symmetric NAT traversal. |
| `VITE_TURN_USERNAME` | *(empty)* | TURN username. |
| `VITE_TURN_PASSWORD` | *(empty)* | TURN password. |

---

## 🌐 Production Cloud Deployment

### 1. Deploy Backend (Render / Railway / Fly.io / Docker)

#### Deploying on Render:
1. Create a **New Web Service** connected to your GitHub repository.
2. Set **Root Directory** to `backend` (or `apex_pulse/backend`).
3. Set **Runtime** to `Python 3`.
4. Set **Build Command**: `pip install -r requirements.txt`
5. Set **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Add Environment Variables:
   - `TELEMETRY_MODE` = `synthetic`
   - `CORS_ORIGINS` = `https://your-frontend.vercel.app`
7. Copy your assigned public URL (e.g., `https://apex-pulse-api.onrender.com`).

#### Deploying via Docker:
```bash
cd backend
docker build -t apex-pulse-backend .
docker run -p 8000:8000 -e PORT=8000 apex-pulse-backend
```

### 2. Deploy Frontend (Vercel / Netlify / Cloudflare Pages)

#### Deploying on Vercel:
1. Import your GitHub repository on [Vercel](https://vercel.com).
2. Set **Root Directory** to `apex_pulse/frontend`.
3. Set **Framework Preset** to `Vite`.
4. Set **Build Command**: `npm run build`
5. Set **Output Directory**: `dist`
6. Add Environment Variable:
   - `VITE_API_URL` = `https://apex-pulse-api.onrender.com`
7. Click **Deploy**.

Your frontend is now live with full WebSocket and WebRTC connectivity to your backend!

---

## 🎙️ WebRTC Voice Radio (Cross-Network STUN / TURN)

- **Local Network / Normal Wi-Fi**: Works out-of-the-box using the built-in Google STUN servers (`stun:stun.l.google.com:19302`).
- **Cellular Data / Strict Firewalls**: When connecting between devices on different cellular networks or behind corporate symmetric NATs, configure a free TURN relay server:
  1. Sign up for a free account on [Metered.ca](https://www.metered.ca/stun-turn) or [Twilio](https://www.twilio.com/stun-turn).
  2. Set the environment variables in your frontend deployment:
     ```env
     VITE_TURN_SERVER=turn:global.relay.metered.ca:80
     VITE_TURN_USERNAME=your_username
     VITE_TURN_PASSWORD=your_password
     ```
  3. Re-deploy the frontend. WebRTC voice will route through the TURN relay when peer-to-peer connection is restricted by firewall policies.

---

## 🔍 Health Checks & API Verification

- `GET /health` — Verifies backend health, telemetry engine, and active WebSocket connections:
  ```json
  {
    "status": "ok",
    "service": "apex-pulse-backend",
    "version": "1.0.0",
    "telemetry_mode": "synthetic",
    "connected_clients": 1
  }
  ```
- `GET /` — API metadata and available endpoints.
- `GET /api/laps` — 50-lap telemetry dataset.
- `GET /api/drivers` — Multi-driver registry and real-time gap tracking.
- `WS /ws` — 20Hz binary/JSON real-time telemetry stream.

---

## 🔧 Troubleshooting

| Symptom | Probable Cause | Resolution |
| :--- | :--- | :--- |
| **"DATA STREAM INTERRUPTED" banner** | Frontend cannot reach backend WebSocket | Verify `VITE_API_URL` or `VITE_WS_URL` is set to the HTTPS/WSS backend URL in frontend settings. |
| **CORS error in browser console** | Backend blocking frontend domain | Add your frontend domain to `CORS_ORIGINS` in the backend environment settings. |
| **Call connects but no voice audio** | Microphone permissions or browser autoplay policy | Click "ACCEPT CALL" on the driver screen to unlock AudioContext. Check browser mic permissions. |
| **WebRTC connects locally but not across 5G** | Symmetric NAT firewall | Configure `VITE_TURN_SERVER` credentials from Metered.ca or Twilio. |
| **Backend crash on cold start** | Missing dataset or Python dependencies | Verify `backend/data/` contains `telemetry.csv` and `kaggle_f1_overtakes.csv`. |

---

## 📜 License
MIT License. Built for Formula Racing AI Strategy & Telemetry Hackathon.
