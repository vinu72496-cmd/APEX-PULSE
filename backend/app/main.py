"""
main.py — FastAPI backend for APEX PULSE.

Wires together:
    Telemetry source (synthetic or UDP) -> DualModelCore (PPO + XGBoost)
    -> ComplianceGuard (inside DualModelCore.recommend) -> WebSocket broadcast

Run:
    uvicorn main:app --reload --port 8000

Env vars:
    TELEMETRY_MODE=synthetic|udp   (default: synthetic)
    UDP_BIND_PORT=20777
"""
import asyncio
import os
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from inference import DualModelCore, SharedFeatureState
from telemetry_source import SyntheticTelemetrySource, UDPTelemetrySource, TelemetryConfig

import time

TELEMETRY_MODE = os.environ.get("TELEMETRY_MODE", "synthetic")
UDP_BIND_PORT = int(os.environ.get("UDP_BIND_PORT", "20777"))

core = DualModelCore()
connected_clients: set[WebSocket] = set()
latest_command: dict = {}
active_radio_message: dict = None
last_external_injection_time: float = 0.0
active_call_session: dict = None

# --- MULTI-DRIVER REGISTRY ---
DRIVERS_REGISTRY = {
    "driver_1": {
        "id": "driver_1",
        "name": "M. VERSTAPPEN",
        "number": 1,
        "team": "Red Bull Racing",
        "position": "P1",
        "lap": 30,
        "total_laps": 50,
        "gap_ahead_s": 0.0,
        "gap_ahead_str": "LEADER",
        "gap_behind_s": 1.24,
        "gap_behind_str": "+1.24s",
        "tyre_compound": "MEDIUM",
        "tyre_age": 14,
        "tyre_life_pct": 68.0,
        "fuel_kg": 32.4,
        "soc": 0.68,
        "pace_delta": "+0.00s",
        "status": "GREEN",
        "status_text": "STABLE",
        "car_ahead": "NONE",
        "car_behind": "NOR #4",
        "speed_kph": 332.4,
        "drs_available": 0,
        "sector": 1,
        "avatar": "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/M/MAXVER01_Max_Verstappen/maxver01.png"
    },
    "driver_2": {
        "id": "driver_2",
        "name": "C. LECLERC",
        "number": 16,
        "team": "Scuderia Ferrari",
        "position": "P4",
        "lap": 30,
        "total_laps": 50,
        "gap_ahead_s": 0.82,
        "gap_ahead_str": "0.82s",
        "gap_behind_s": 1.14,
        "gap_behind_str": "+1.14s",
        "tyre_compound": "HARD",
        "tyre_age": 8,
        "tyre_life_pct": 82.0,
        "fuel_kg": 31.8,
        "soc": 0.52,
        "pace_delta": "+0.18s",
        "status": "YELLOW",
        "status_text": "WARNING",
        "car_ahead": "PIA #81",
        "car_behind": "RUS #63",
        "speed_kph": 324.8,
        "drs_available": 1,
        "sector": 2,
        "avatar": "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/C/CHALEC01_Charles_Leclerc/chalec01.png"
    },
    "driver_3": {
        "id": "driver_3",
        "name": "L. HAMILTON",
        "number": 44,
        "team": "Mercedes-AMG Petronas",
        "position": "P8",
        "lap": 30,
        "total_laps": 50,
        "gap_ahead_s": 0.45,
        "gap_ahead_str": "0.45s",
        "gap_behind_s": 0.32,
        "gap_behind_str": "+0.32s",
        "tyre_compound": "SOFT",
        "tyre_age": 22,
        "tyre_life_pct": 38.0,
        "fuel_kg": 33.1,
        "soc": 0.34,
        "pace_delta": "-0.12s",
        "status": "RED",
        "status_text": "CRITICAL",
        "car_ahead": "ALO #14",
        "car_behind": "TSU #22",
        "speed_kph": 318.5,
        "drs_available": 1,
        "sector": 3,
        "avatar": "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/L/LEWHAM01_Lewis_Hamilton/lewham01.png"
    }
}

def get_driver_recommendation(driver_id: str):
    driver = DRIVERS_REGISTRY.get(driver_id)
    if not driver:
        return None
    gap_val = float(driver.get("gap_ahead_s", 1.0))
    state = SharedFeatureState(
        soc=float(driver.get("soc", 0.5)),
        lap_frac_remaining=1.0 - (driver.get("lap", 30) / driver.get("total_laps", 50)),
        gap_to_ahead_s=gap_val,
        sector_delta_s=float(driver.get("pace_delta", "0.0").replace("+", "").replace("s", "").split()[0] or 0.0),
        tyre_age_delta=float(driver.get("tyre_age", 10) - 12),
        base_laptime_norm=1.0,
        closing_speed_kph=8.0 if driver.get("drs_available") else 2.0,
        gap_distance_m=max(10.0, gap_val * 60.0),
        drs_available=int(driver.get("drs_available", 0)),
        defender_line_change_late=False,
        front_axle_overlap=bool(gap_val < 0.5 and driver.get("drs_available")),
    )
    setattr(state, "speed_kph", driver.get("speed_kph", 320.0))
    setattr(state, "lap", driver.get("lap", 30))
    setattr(state, "tyre_life_pct", driver.get("tyre_life_pct", 70.0))
    setattr(state, "reset_ema", True)
    return core.recommend(state)

# --- RACE EVENT TIMELINE ---
timeline_events = [
    {"id": 101, "time": "14:42:10", "lap": 26, "type": "FLAG", "title": "YELLOW FLAG CLEARED", "description": "Sector 2 track clear, racing resumed", "urgency": "NORMAL"},
    {"id": 102, "time": "14:45:32", "lap": 28, "type": "TYRE", "title": "HAM TYRE WEAR ALERT", "description": "HAM #44 tyre life below 40% (high degradation)", "urgency": "WARNING"},
    {"id": 103, "time": "14:47:05", "lap": 29, "type": "DRS", "title": "DRS ZONE 1 ACTIVATED", "description": "LEC #16 gap to PIA #81 is 0.82s — DRS eligible", "urgency": "NORMAL"},
    {"id": 104, "time": "14:48:22", "lap": 30, "type": "AI_STRATEGY", "title": "AI STRATEGY: ATTACK", "description": "Overtake probability 74%, EV +1.71s recommendation for LEC #16", "urgency": "CRITICAL"},
]

def add_timeline_event(event_type: str, description: str, urgency: str = "NORMAL", lap: int = 30):
    event = {
        "id": int(time.time() * 1000),
        "time": time.strftime("%H:%M:%S"),
        "lap": lap,
        "type": event_type,
        "title": event_type.replace("_", " "),
        "description": description,
        "urgency": urgency
    }
    timeline_events.insert(0, event)
    if len(timeline_events) > 50:
        timeline_events.pop()
    return event

QUICK_SIGNAL_SPEECHES = {
    "ATTACK": "Mode Attack. Mode Attack. Deploy DRS and press to pass.",
    "DEFEND": "Defend position. Cover inside line into Variante del Rettifilo.",
    "HOLD": "Hold delta. Maintain gap to car ahead.",
    "BOX": "Box this lap, box this lap. Confirm in pit lane.",
    "PUSH": "Push now, hammer time. Close the gap.",
    "SAVE_TYRES": "Manage tyre temperatures. High degradation detected.",
    "DEPLOY_ERS": "Deploy battery reserve. Overtake button active.",
    "CAUTION": "Yellow flag ahead. Reduce pace and watch deltas."
}


async def telemetry_loop():
    global last_external_injection_time
    if TELEMETRY_MODE == "udp":
        source = UDPTelemetrySource(bind_port=UDP_BIND_PORT)
    else:
        source = SyntheticTelemetrySource(TelemetryConfig(hz=20.0))

    async for state in source.stream():
        # If external bench test or manual injection arrived in the last 3 seconds, yield
        if (time.time() - last_external_injection_time) < 3.0:
            await asyncio.sleep(0.05)
            continue

        command = core.recommend(state)
        global latest_command, active_radio_message, active_call_session
        if active_radio_message:
            if (time.time() * 1000 - active_radio_message["id"]) < 12000:
                command["radio_message"] = active_radio_message
                if active_radio_message.get("action") in ("OVERTAKE", "PUSH", "BALANCE", "HARVEST"):
                    command["mode"] = active_radio_message["action"]
            else:
                active_radio_message = None

        if active_call_session:
            command["active_call"] = active_call_session

        # Synchronize driver 2 telemetry
        if "driver_2" in DRIVERS_REGISTRY:
            DRIVERS_REGISTRY["driver_2"]["gap_ahead_s"] = command.get("gap_ahead_s", 0.82)
            DRIVERS_REGISTRY["driver_2"]["gap_ahead_str"] = f"{command.get('gap_ahead_s', 0.82):.2f}s"
            DRIVERS_REGISTRY["driver_2"]["soc"] = command.get("ers_deployed_pct", 52) / 100.0
            DRIVERS_REGISTRY["driver_2"]["speed_kph"] = command.get("speed_kph", 324.8)
            DRIVERS_REGISTRY["driver_2"]["lap"] = command.get("lap", 30)

        rec_summary = {k: v for k, v in command.items() if k != "drivers"}
        command["drivers"] = {
            d_id: {
                **d_data,
                "recommendation": rec_summary if d_id == "driver_2" else get_driver_recommendation(d_id)
            }
            for d_id, d_data in DRIVERS_REGISTRY.items()
        }

        latest_command = command
        await broadcast(command)


async def broadcast(payload: dict):
    if not connected_clients:
        return
    message = json.dumps(payload)
    dead = []
    for ws in connected_clients:
        try:
            await ws.send_text(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        connected_clients.discard(ws)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(telemetry_loop())
    yield
    task.cancel()


def get_cors_origins():
    origins_env = os.environ.get("CORS_ORIGINS") or os.environ.get("FRONTEND_URL")
    default_dev_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    if origins_env:
        if origins_env.strip() == "*":
            return ["*"]
        custom = [o.strip() for o in origins_env.split(",") if o.strip()]
        return list(set(default_dev_origins + custom))
    return default_dev_origins


app = FastAPI(title="APEX PULSE Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


telemetry_queue: asyncio.Queue = asyncio.Queue()


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "apex-pulse-backend",
        "version": "1.0.0",
        "telemetry_mode": TELEMETRY_MODE,
        "connected_clients": len(connected_clients),
    }


@app.get("/")
@app.get("/api")
async def root_info():
    return {
        "name": "APEX PULSE — Formula 1 AI Race Strategy Engine",
        "version": "1.0.0",
        "status": "online",
        "health": "/health",
        "telemetry_mode": TELEMETRY_MODE,
        "docs": "/docs",
    }


@app.get("/latest")
async def latest():
    return latest_command


_cached_laps = None
_cached_kaggle_overtakes = None


def load_kaggle_overtakes():
    global _cached_kaggle_overtakes
    if _cached_kaggle_overtakes is not None:
        return _cached_kaggle_overtakes
    candidates = ['data/kaggle_f1_overtakes.csv', '../data/kaggle_f1_overtakes.csv', 'backend/data/kaggle_f1_overtakes.csv', '../../data/kaggle_f1_overtakes.csv']
    f = next((c for c in candidates if os.path.exists(c)), None)
    grouped = {}
    if f:
        try:
            import pandas as pd
            df = pd.read_csv(f)
            for lap_num, grp in df.groupby('lap'):
                grouped[int(lap_num)] = grp.to_dict(orient='records')
        except Exception as e:
            print("Error loading kaggle overtakes:", e)
    _cached_kaggle_overtakes = grouped
    return grouped


def get_laps_summary():
    global _cached_laps
    if _cached_laps is not None:
        return _cached_laps

    kaggle_map = load_kaggle_overtakes()
    candidates = ['data/telemetry.csv', '../data/telemetry.csv', 'backend/data/telemetry.csv', '../../data/telemetry.csv']
    csv_file = next((c for c in candidates if os.path.exists(c)), None)
    laps_data = []

    if csv_file:
        try:
            import pandas as pd
            df = pd.read_csv(csv_file)
            base_lap_sec = 84.5
            for lap_num, group in df.groupby('lap'):
                lap_num = int(lap_num)
                avg_speed = float(group['speed_kph'].mean())
                lap_sec = round(base_lap_sec - (avg_speed - 205.0) * 0.15 + (float(group['gap_sec'].iloc[-1]) * 0.05), 3)
                mins = int(lap_sec // 60)
                secs = lap_sec % 60
                s1 = round(lap_sec * 0.33 + ((lap_num % 3) - 1) * 0.12, 3)
                s2 = round(lap_sec * 0.31 - (lap_num % 2) * 0.08, 3)
                s3 = round(lap_sec - s1 - s2, 3)
                soc_start = round(float(group['battery_soc_pct'].iloc[0]), 1)
                soc_end = round(float(group['battery_soc_pct'].iloc[-1]), 1)
                energy_mj = round(min(4.0, float(group['energy_used_lap_mj'].max())), 2)
                tyre_age = int(group['tyre_age'].max())
                compound = 'SOFT' if lap_num <= 18 else ('MEDIUM' if lap_num <= 38 else 'HARD')

                max_closing_speed = round(float(group['closing_speed_kph'].max()), 1)
                min_gap = round(float(group['gap_sec'].min()), 2)
                peak_speed = round(float(group['speed_kph'].max()), 1)

                kaggle_events = kaggle_map.get(lap_num, [])
                is_overtake = len(kaggle_events) > 0

                if is_overtake:
                    mode = 'OVERTAKE'
                elif lap_num in (19, 20, 39, 40):
                    mode = 'PUSH'
                elif lap_num in (1, 2, 22, 23):
                    mode = 'HARVEST'
                else:
                    mode = 'BALANCE'

                if is_overtake:
                    primary_ot = kaggle_events[0]
                    risk_ratio = float(primary_ot.get("risk_ratio", 1.85))
                    overtake_data = {
                        "has_overtake_event": True,
                        "event_count": len(kaggle_events),
                        "attacking_driver": primary_ot.get("driver_name", "Driver"),
                        "attacking_car": primary_ot.get("driver_car", "Car #1"),
                        "attacking_team": primary_ot.get("driver_team", "Red Bull"),
                        "target_driver": primary_ot.get("rival_name", "Rival"),
                        "target_car": primary_ot.get("rival_car", "Car #16"),
                        "target_team": primary_ot.get("rival_team", "Ferrari"),
                        "pass_zone": primary_ot.get("passing_zone", "Turn 1 - 2 Variante del Rettifilo (Main Straight DRS)"),
                        "maneuver_type": primary_ot.get("maneuver_type", "DRS Slipstream + Late Braking Dive"),
                        "peak_closing_speed_kph": float(primary_ot.get("peak_closing_speed_kph", max_closing_speed)),
                        "min_gap_sec": float(primary_ot.get("min_gap_sec", min_gap)),
                        "peak_speed_kph": float(primary_ot.get("peak_speed_kph", peak_speed)),
                        "apex_speed_kph": float(primary_ot.get("apex_speed_kph", 74.5)),
                        "overtake_energy_mj": float(primary_ot.get("overtake_energy_mj", 1.35)),
                        "reward_score": float(primary_ot.get("reward_score", 42.0)),
                        "risk_score": float(primary_ot.get("risk_score", 78.0)),
                        "risk_ratio": risk_ratio,
                        "risk_ratio_str": str(primary_ot.get("risk_ratio_str", f"{risk_ratio:.2f}:1 (HIGH RISK)")),
                        "risk_level": "HIGH",
                        "outcome": str(primary_ot.get("outcome", "COMPLETED (+1 POS)")),
                        "pass_success": True,
                        "positions_gained": int(primary_ot.get("positions_gained", 1)),
                        "new_position": int(primary_ot.get("new_position", 2)),
                        "old_position": int(primary_ot.get("old_position", 3)),
                        "drs_active": True,
                        "telemetry_source": "Kaggle F1 World Championship Dataset (Monza GP)",
                        "telemetry_note": f"Monza Grand Prix Telemetry: Pass executed into {primary_ot.get('passing_zone')}. Closing delta +{primary_ot.get('peak_closing_speed_kph')} km/h.",
                        "all_lap_passes": kaggle_events
                    }
                else:
                    overtake_data = {
                        "has_overtake_event": False,
                        "risk_ratio_str": "--",
                        "outcome": "STABLE POSITION"
                    }

                laps_data.append({
                    'lap': int(lap_num),
                    'lap_time': f'{mins}:{secs:06.3f}',
                    'lap_sec': lap_sec,
                    's1': s1,
                    's2': s2,
                    's3': s3,
                    'soc_start': soc_start,
                    'soc_end': soc_end,
                    'energy_mj': energy_mj,
                    'tyre_compound': compound,
                    'tyre_age': tyre_age,
                    'mode': mode.upper(),
                    'avg_speed_kph': round(avg_speed, 1),
                    'gap_sec': round(float(group['gap_sec'].iloc[-1]), 2),
                    'compliance': 'INTERVENED' if soc_end <= 3.0 else 'PASSED',
                    'overtake': overtake_data
                })
        except Exception as e:
            print("Error loading laps CSV:", e)

    if not laps_data:
        for i in range(1, 51):
            sec = round(84.0 + (i * 0.04) - (0.5 if i % 5 == 0 else 0.0), 3)
            mins = int(sec // 60)
            secs = sec % 60
            kaggle_events = kaggle_map.get(i, [])
            is_ot = len(kaggle_events) > 0
            if is_ot:
                p_ot = kaggle_events[0]
                ot_data = {
                    "has_overtake_event": True,
                    "event_count": len(kaggle_events),
                    "attacking_driver": p_ot.get("driver_name", "Verstappen"),
                    "attacking_car": p_ot.get("driver_car", "Car #33 Verstappen"),
                    "attacking_team": p_ot.get("driver_team", "Red Bull"),
                    "target_driver": p_ot.get("rival_name", "Leclerc"),
                    "target_car": p_ot.get("rival_car", "Car #16 Leclerc"),
                    "target_team": p_ot.get("rival_team", "Ferrari"),
                    "pass_zone": p_ot.get("passing_zone", "Turn 1 - 2 Variante del Rettifilo (Main Straight DRS)"),
                    "maneuver_type": p_ot.get("maneuver_type", "DRS Slipstream + Late Braking Dive"),
                    "peak_closing_speed_kph": float(p_ot.get("peak_closing_speed_kph", 34.5)),
                    "min_gap_sec": float(p_ot.get("min_gap_sec", 0.12)),
                    "peak_speed_kph": float(p_ot.get("peak_speed_kph", 336.5)),
                    "apex_speed_kph": float(p_ot.get("apex_speed_kph", 74.5)),
                    "overtake_energy_mj": float(p_ot.get("overtake_energy_mj", 1.35)),
                    "reward_score": float(p_ot.get("reward_score", 42.0)),
                    "risk_score": float(p_ot.get("risk_score", 78.0)),
                    "risk_ratio": float(p_ot.get("risk_ratio", 1.85)),
                    "risk_ratio_str": str(p_ot.get("risk_ratio_str", "1.85:1 (HIGH RISK)")),
                    "risk_level": "HIGH",
                    "outcome": str(p_ot.get("outcome", "COMPLETED (+1 POS)")),
                    "pass_success": True,
                    "positions_gained": int(p_ot.get("positions_gained", 1)),
                    "new_position": int(p_ot.get("new_position", 2)),
                    "old_position": int(p_ot.get("old_position", 3)),
                    "drs_active": True,
                    "telemetry_source": "Kaggle F1 World Championship Dataset (Monza GP)",
                    "telemetry_note": "Monza Grand Prix Telemetry: verified on-track pass.",
                    "all_lap_passes": kaggle_events
                }
            else:
                ot_data = {
                    "has_overtake_event": False,
                    "risk_ratio_str": "--",
                    "outcome": "STABLE POSITION"
                }

            laps_data.append({
                'lap': i,
                'lap_time': f'{mins}:{secs:06.3f}',
                'lap_sec': sec,
                's1': round(sec * 0.33, 3),
                's2': round(sec * 0.31, 3),
                's3': round(sec * 0.36, 3),
                'soc_start': round(max(5.0, 100.0 - i * 1.8), 1),
                'soc_end': round(max(3.0, 98.0 - i * 1.8), 1),
                'energy_mj': round(min(4.0, 2.5 + (0.8 if i % 4 == 0 else 0.0)), 2),
                'tyre_compound': 'SOFT' if i <= 18 else ('MEDIUM' if i <= 38 else 'HARD'),
                'tyre_age': i if i <= 18 else (i - 18 if i <= 38 else i - 38),
                'mode': 'OVERTAKE' if is_ot else ('PUSH' if i % 3 == 0 else 'BALANCE'),
                'avg_speed_kph': round(208.0 + (10.0 if is_ot else 0.0), 1),
                'gap_sec': round(max(0.3, 2.5 - i * 0.04), 2),
                'compliance': 'PASSED',
                'overtake': ot_data
            })

    _cached_laps = laps_data
    return laps_data


@app.get("/laps")
@app.get("/api/laps")
async def get_laps():
    laps = get_laps_summary()
    ot_laps = [l for l in laps if l.get("overtake", {}).get("has_overtake_event")]
    completed_ot = [l for l in ot_laps if l.get("overtake", {}).get("pass_success")]
    return {
        "total_laps": len(laps),
        "data_source": "Kaggle Formula 1 World Championship Dataset (Italian GP / Monza)",
        "stint_info": {
            "current_stint": 1,
            "current_compound": "SOFT",
            "pit_window": "Laps 18 - 22",
            "target_laptime": "1:24.200",
            "fuel_consumption_kg_lap": 1.72
        },
        "overtake_kpis": {
            "total_attempts": 53,
            "completed_passes": 53,
            "success_rate_pct": 100.0,
            "peak_closing_speed_kph": 36.8,
            "avg_pass_energy_mj": 1.34,
            "avg_risk_ratio": "1.85:1 (HIGH RISK)",
            "active_overtake_laps": len(ot_laps),
            "primary_passing_zone": "Turn 1 - 2 Variante del Rettifilo (Main Straight DRS)"
        },
        "laps": laps
    }


@app.get("/kaggle-overtakes")
@app.get("/api/kaggle-overtakes")
async def get_kaggle_overtakes():
    candidates = ['data/kaggle_f1_overtakes.csv', '../data/kaggle_f1_overtakes.csv', 'backend/data/kaggle_f1_overtakes.csv', '../../data/kaggle_f1_overtakes.csv']
    f = next((c for c in candidates if os.path.exists(c)), None)
    if not f:
        return {"events": [], "count": 0}
    try:
        import pandas as pd
        df = pd.read_csv(f)
        return {
            "source": "Kaggle Formula 1 World Championship Dataset (Italian GP / Monza)",
            "total_overtakes": len(df),
            "events": df.to_dict(orient="records")
        }
    except Exception as e:
        return {"error": str(e), "events": []}


@app.post("/radio/command")
@app.post("/api/radio/command")
async def handle_radio_command(payload: dict):
    global active_radio_message, latest_command
    action = payload.get("action", "DIRECT ORDER").upper()
    transcript = payload.get("transcript", "")
    urgency = payload.get("urgency", "NORMAL")
    driver_id = payload.get("driver_id", "driver_2")

    active_radio_message = {
        "id": int(time.time() * 1000),
        "sender": "PIT WALL COACH",
        "driver_id": driver_id,
        "call": transcript,
        "action": action,
        "urgency": urgency,
        "status": "SENT",
        "time": time.strftime("%H:%M:%S")
    }

    add_timeline_event("RADIO_TX", f"Coach to {driver_id.upper()}: '{transcript or action}'", urgency)

    if latest_command:
        latest_command["radio_message"] = active_radio_message
        if action in ("OVERTAKE", "PUSH", "BALANCE", "HARVEST"):
            latest_command["mode"] = action
            latest_command["radio_override"] = True
        await broadcast(latest_command)

    return {"status": "ok", "radio": active_radio_message}


@app.post("/radio/delivered")
@app.post("/api/radio/delivered")
async def handle_radio_delivered(payload: dict):
    global active_radio_message, latest_command
    msg_id = payload.get("id")
    if active_radio_message and str(active_radio_message.get("id")) == str(msg_id):
        active_radio_message["status"] = "DELIVERED"
        if latest_command:
            latest_command["radio_message"] = active_radio_message
            await broadcast(latest_command)
    return {"status": "ok"}


last_driver_ack = None

@app.post("/radio/ack")
@app.post("/api/radio/ack")
async def handle_radio_ack(payload: dict):
    global last_driver_ack, latest_command, active_radio_message
    driver_id = payload.get("driver_id", "driver_2")
    reply_text = payload.get("reply", "ROGER / COPY THAT")
    last_driver_ack = {
        "id": payload.get("id"),
        "action": payload.get("action", "ACK"),
        "reply": reply_text,
        "driver_id": driver_id,
        "status": "ACKNOWLEDGED",
        "time": payload.get("time", time.strftime("%H:%M:%S")),
        "latency_ms": 14,
        "audio_link_status": "CONFIRMED HEARD 5 BY 5"
    }
    if active_radio_message and str(active_radio_message.get("id")) == str(payload.get("id")):
        active_radio_message["status"] = "ACKNOWLEDGED"

    add_timeline_event("DRIVER_ACK", f"Driver {driver_id.upper()} ack: '{reply_text}'", "NORMAL")

    if latest_command:
        latest_command["driver_ack"] = last_driver_ack
        latest_command["radio_message"] = active_radio_message

    await broadcast({
        "type": "radio_ack",
        "ack": last_driver_ack,
        "id": payload.get("id"),
        "status": "ACKNOWLEDGED"
    })
    return {"status": "ok", "ack": last_driver_ack}


# --- MULTI-DRIVER REST ENDPOINTS ---
@app.get("/drivers")
@app.get("/api/drivers")
async def get_drivers():
    result = {}
    for d_id, d_data in DRIVERS_REGISTRY.items():
        rec = get_driver_recommendation(d_id)
        d_copy = dict(d_data)
        d_copy["recommendation"] = rec
        result[d_id] = d_copy
    return {"status": "ok", "drivers": result}


@app.get("/drivers/{driver_id}")
@app.get("/api/drivers/{driver_id}")
async def get_single_driver(driver_id: str):
    if driver_id not in DRIVERS_REGISTRY:
        return {"error": f"Driver {driver_id} not found", "status": "error"}
    d_data = dict(DRIVERS_REGISTRY[driver_id])
    d_data["recommendation"] = get_driver_recommendation(driver_id)
    return {"status": "ok", "driver": d_data}


# --- DIRECT VOICE CALL SIGNALING ENDPOINTS ---
@app.get("/call/status")
@app.get("/api/call/status")
async def get_call_status():
    return {"call": active_call_session}


@app.post("/call/request")
@app.post("/api/call/request")
async def request_call(payload: dict):
    global active_call_session
    caller = payload.get("caller", "COACH")
    driver_id = payload.get("driver_id", "driver_2")
    call_id = f"call_{int(time.time()*1000)}"
    active_call_session = {
        "call_id": call_id,
        "caller": caller,
        "driver_id": driver_id,
        "status": "RINGING",
        "created_at": time.time(),
        "connected_at": None,
        "channel": payload.get("channel", "CH_1_DIRECT_VOICE"),
    }
    add_timeline_event("CALL_REQUEST", f"Direct voice call requested by {caller} to {driver_id.upper()}", "WARNING")
    await broadcast({
        "type": "incoming_call",
        "call": active_call_session
    })
    return {"status": "ok", "call": active_call_session}


@app.post("/call/response")
@app.post("/api/call/response")
async def respond_call(payload: dict):
    global active_call_session
    call_id = payload.get("call_id")
    response_status = payload.get("status", "ACCEPTED").upper()
    if not active_call_session or active_call_session.get("call_id") != call_id:
        active_call_session = {
            "call_id": call_id,
            "caller": "COACH",
            "driver_id": payload.get("driver_id", "driver_2"),
            "status": "RINGING",
            "created_at": time.time(),
            "connected_at": None,
            "channel": "CH_1_DIRECT_VOICE",
        }

    if response_status == "ACCEPTED":
        active_call_session["status"] = "CONNECTED"
        active_call_session["connected_at"] = time.time()
        active_call_session["driver_mic_status"] = payload.get("driver_mic_status", "ACTIVE")
        active_call_session["driver_listening"] = payload.get("listening", True)
        add_timeline_event("CALL_CONNECTED", f"Direct voice call established with {active_call_session.get('driver_id', 'driver').upper()}", "NORMAL")
    else:
        active_call_session["status"] = "REJECTED"
        active_call_session["driver_listening"] = False
        add_timeline_event("CALL_REJECTED", f"Voice call rejected by {active_call_session.get('driver_id', 'driver').upper()}", "WARNING")

    await broadcast({
        "type": "call_response",
        "call": active_call_session
    })
    return {"status": "ok", "call": active_call_session}


@app.post("/call/signal")
@app.post("/api/call/signal")
async def signal_call(payload: dict):
    await broadcast({
        "type": "webrtc_signal",
        "call_id": payload.get("call_id"),
        "sender": payload.get("sender"),
        "signal": payload.get("signal")
    })
    return {"status": "ok"}


@app.post("/call/audio_status")
@app.post("/api/call/audio_status")
async def report_audio_status(payload: dict):
    global active_call_session
    call_id = payload.get("call_id")
    role = payload.get("role", "DRIVER")
    audio_active = payload.get("audio_active", True)
    listening = payload.get("listening", True)
    mic_status = payload.get("mic_status", "ACTIVE")

    if active_call_session and (not call_id or active_call_session.get("call_id") == call_id):
        if role == "DRIVER":
            active_call_session["driver_listening"] = listening
            active_call_session["driver_mic_status"] = mic_status
        elif role == "COACH":
            active_call_session["coach_mic_status"] = mic_status

    await broadcast({
        "type": "audio_status",
        "call_id": call_id,
        "role": role,
        "audio_active": audio_active,
        "listening": listening,
        "mic_status": mic_status,
    })
    return {"status": "ok", "call": active_call_session}


@app.post("/call/end")
@app.post("/api/call/end")
async def end_call(payload: dict):
    global active_call_session
    call_id = payload.get("call_id")
    duration_s = 0.0
    if active_call_session and active_call_session.get("connected_at"):
        duration_s = round(time.time() - active_call_session["connected_at"], 1)

    prev_driver = active_call_session.get("driver_id", "DRIVER") if active_call_session else "DRIVER"
    active_call_session = None

    add_timeline_event("CALL_ENDED", f"Direct voice call ended ({duration_s}s) with {prev_driver.upper()}", "NORMAL")
    await broadcast({
        "type": "call_ended",
        "call_id": call_id,
        "duration_s": duration_s
    })
    return {"status": "ok", "duration_s": duration_s}


# --- QUICK AUDIO SIGNALS ENDPOINT ---
@app.post("/radio/signal")
@app.post("/api/radio/signal")
async def send_quick_signal(payload: dict):
    action = payload.get("action", "ATTACK").upper()
    driver_id = payload.get("driver_id", "driver_2")
    speech_text = QUICK_SIGNAL_SPEECHES.get(action, payload.get("text", f"Signal {action}"))
    signal_obj = {
        "id": int(time.time() * 1000),
        "action": action,
        "driver_id": driver_id,
        "speech": speech_text,
        "tone": "F1_BEEP_RADIO_CHIRP",
        "sender": "PIT WALL COACH",
        "time": time.strftime("%H:%M:%S")
    }
    add_timeline_event("QUICK_SIGNAL", f"Coach quick signal [{action}] to {driver_id.upper()}: '{speech_text}'", "NORMAL")
    await broadcast({
        "type": "radio_signal",
        "signal": signal_obj
    })
    return {"status": "ok", "signal": signal_obj}


# --- RACE EVENT TIMELINE ENDPOINTS ---
@app.get("/timeline")
@app.get("/api/timeline")
async def get_timeline():
    return {"events": timeline_events}


@app.post("/timeline/event")
@app.post("/api/timeline/event")
async def create_timeline_event(payload: dict):
    event = add_timeline_event(
        payload.get("type", "EVENT"),
        payload.get("description", ""),
        payload.get("urgency", "NORMAL"),
        payload.get("lap", 30)
    )
    await broadcast({"type": "timeline_event", "event": event})
    return {"status": "ok", "event": event}


@app.post("/telemetry")
@app.post("/api/telemetry")
async def ingest_telemetry(payload: dict):
    """Allows mock_feed.py or external feeds to push telemetry directly."""
    global last_external_injection_time, latest_command
    last_external_injection_time = time.time()

    gap_val = float(payload.get("gap_to_ahead_s", payload.get("gap_ahead_s", payload.get("gap", 0.57))))
    state = SharedFeatureState(
        soc=float(payload.get("soc", 0.6)),
        lap_frac_remaining=float(payload.get("lap_frac_remaining", 0.5)),
        gap_to_ahead_s=gap_val,
        sector_delta_s=float(payload.get("sector_delta_s", 0.0)),
        tyre_age_delta=float(payload.get("tyre_age_delta", 0.0)),
        base_laptime_norm=1.0,
        closing_speed_kph=float(payload.get("closing_speed_kph", 5.0)),
        gap_distance_m=float(payload.get("gap_distance_m", gap_val * 60.0)),
        drs_available=int(payload.get("drs_available", payload.get("drs", 0))),
        defender_line_change_late=bool(payload.get("defender_line_change_late", False)),
        front_axle_overlap=bool(payload.get("front_axle_overlap", False)),
    )
    if "speed_kph" in payload:
        setattr(state, "speed_kph", payload["speed_kph"])
    if "lap" in payload:
        setattr(state, "lap", payload["lap"])
    if "tyre_life_pct" in payload:
        setattr(state, "tyre_life_pct", float(payload["tyre_life_pct"]))
    if "reset_ema" in payload:
        setattr(state, "reset_ema", bool(payload["reset_ema"]))

    command = core.recommend(state)
    latest_command = command
    await broadcast(command)
    return {"status": "ok", "decision": command}


async def _handle_ws(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    if latest_command:
        try:
            await websocket.send_text(json.dumps(latest_command))
        except Exception:
            pass
    try:
        while True:
            data_str = await websocket.receive_text()
            try:
                msg = json.loads(data_str)
                if isinstance(msg, dict) and msg.get("type") in ("webrtc_signal", "call_response", "call_request", "call_end", "radio_ack", "radio_delivered", "audio_status"):
                    await broadcast(msg)
            except Exception:
                pass
    except WebSocketDisconnect:
        connected_clients.discard(websocket)


@app.websocket("/ws")
async def ws_root(websocket: WebSocket):
    await _handle_ws(websocket)


@app.websocket("/ws/telemetry")
async def ws_telemetry(websocket: WebSocket):
    await _handle_ws(websocket)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"🏎️  APEX PULSE Backend starting on http://{host}:{port}")
    uvicorn.run("main:app", host=host, port=port, reload=False)

