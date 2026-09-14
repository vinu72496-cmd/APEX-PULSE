"""
telemetry_source.py — Live Telemetry Ingest.

Two sources are provided:
  1. SyntheticTelemetrySource — generates a plausible 20 Hz stream so the
     whole pipeline (models -> guard -> websocket -> dashboard) can be
     demoed and judged without a sim running. Use this to develop/rehearse.
  2. UDPTelemetrySource — a real 20 Hz UDP listener you point at your sim.
     The exact byte layout depends on the sim:
       - Assetto Corsa: enable the "Remote Telemetry" / shared memory UDP
         plugin (e.g. ACRemoteTelemetry) and adjust `parse_packet` to that
         plugin's struct layout.
       - F1 24 (Codemasters/EA): enable UDP telemetry in game settings and
         parse the official packet spec (PacketID 6 = CarTelemetryData,
         PacketID 2 = LapData). Use a library like `f1-24-telemetry` or
         write your own struct.unpack matching EA's published spec.
     `parse_packet` below is a stub — replace the struct.unpack call with
     the real layout for whichever sim you target for the live demo.

Both sources expose the same async generator interface so main.py doesn't
care which one is active.
"""
import asyncio
import os
import socket
import struct
import time
from dataclasses import dataclass

import numpy as np

from inference import SharedFeatureState


@dataclass
class TelemetryConfig:
    stint_laps: int = 30
    hz: float = 20.0


def compute_f1_dynamics(
    speed_kph: float,
    prev_speed_kph: float,
    dt: float,
    soc: float = 0.65,
    in_braking: bool = False,
    drs_active: bool = False,
) -> dict:
    speed = max(0.0, float(speed_kph))
    accel = (speed - prev_speed_kph) / max(0.01, dt)

    # Modern 8-speed Formula 1 transmission gear ratio mapping
    if speed < 85.0:
        gear = 2
        g_min, g_max = 40.0, 110.0
    elif speed < 125.0:
        gear = 3
        g_min, g_max = 85.0, 150.0
    elif speed < 170.0:
        gear = 4
        g_min, g_max = 125.0, 195.0
    elif speed < 215.0:
        gear = 5
        g_min, g_max = 170.0, 240.0
    elif speed < 265.0:
        gear = 6
        g_min, g_max = 215.0, 285.0
    elif speed < 310.0:
        gear = 7
        g_min, g_max = 265.0, 325.0
    else:
        gear = 8
        g_min, g_max = 310.0, 360.0

    ratio = float(np.clip((speed - g_min) / max(1.0, g_max - g_min), 0.0, 1.0))
    rpm = int(10400 + ratio * 2050)

    # Smooth physics-based throttle and brake
    if in_braking or accel < -8.0:
        throttle = 0
        brake = int(np.clip(abs(accel) * 3.0 + (45 if in_braking else 15), 15, 100))
    elif accel > 1.5 or speed > 290.0:
        throttle = int(np.clip(80 + accel * 1.5, 75, 100))
        brake = 0
    else:
        throttle = int(np.clip(45 + (speed / 350.0) * 45, 30, 85))
        brake = 0

    base_temp = 98.0 + 7.0 * (speed / 350.0)
    brake_heat = (brake / 100.0) * 8.0
    tyre_temps = {
        "fl": round(base_temp + brake_heat + 1.2, 1),
        "fr": round(base_temp + brake_heat * 0.9, 1),
        "rl": round(base_temp * 0.96, 1),
        "rr": round(base_temp * 0.95, 1),
    }

    return {
        "gear": gear,
        "rpm": rpm,
        "throttle": throttle,
        "brake": brake,
        "tyre_temps": tyre_temps,
    }


class SyntheticTelemetrySource:
    """
    Drives the dashboard with deterministic, physics-based telemetry
    modeling the Autodromo Nazionale Monza circuit (5,793m per lap).
    Zero random walks: acceleration, braking, DRS, closing speed, and ERS
    strictly follow continuous vehicle dynamics and track geometry.
    """

    def __init__(self, config: TelemetryConfig = TelemetryConfig()):
        self.cfg = config
        self.soc = 0.68
        self.lap = 30
        self.track_dist = 620.0  # meters into Monza lap (starting Rettifilo straight)
        self.gap_dist_m = 24.5   # meters behind rival
        self.speed = 318.0       # km/h
        self.prev_speed = 318.0
        self.closing_speed = 8.4 # km/h
        self.tyre_life = 82.0
        self.sector_delta = -0.214
        self.t_last = time.time()
        self.t0 = time.time()

    async def stream(self):
        period = 1.0 / self.cfg.hz
        while True:
            t_now = time.time()
            dt = min(0.1, max(0.01, t_now - self.t_last))
            self.t_last = t_now

            # 1. Continuous Track Position around Monza (5,793m)
            v_mps = self.speed / 3.6
            self.track_dist += v_mps * dt
            if self.track_dist >= 5793.0:
                self.track_dist -= 5793.0
                self.lap = min(self.cfg.stint_laps, self.lap + 1)
                self.tyre_life = max(18.0, self.tyre_life - 2.8)

            # 2. Track Section Dynamics (Monza Geometry)
            # 0-1150m: Rettifilo Straight (DRS Zone 1, Max Speed ~340 km/h)
            # 1150-1420m: Variante del Rettifilo T1-T2 (Hard Braking ~78 km/h)
            # 1420-2200m: Curva Grande (High Speed Sweep ~295 km/h)
            # 2200-2480m: Variante della Roggia (Braking ~118 km/h)
            # 2480-3200m: Curva di Lesmo 1 & 2 (~175 to 220 km/h)
            # 3200-4000m: Serraglio Straight (DRS Zone 2, ~325 km/h)
            # 4000-4400m: Variante Ascari (~170 to 235 km/h)
            # 4400-5300m: Back Straight to Parabolica (~332 km/h)
            # 5300-5793m: Curva Parabolica / Alboreto (~215 km/h)
            d = self.track_dist
            in_drs_zone = (d < 1150.0) or (3200.0 <= d < 4000.0)
            in_braking_zone = (1120.0 <= d <= 1380.0) or (2180.0 <= d <= 2360.0) or (3980.0 <= d <= 4180.0)

            if d < 1120.0:
                target_spd = 338.0
                accel_rate = 14.0
            elif d < 1400.0:
                target_spd = 82.0
                accel_rate = 68.0  # hard deceleration
            elif d < 2180.0:
                target_spd = 296.0
                accel_rate = 18.0
            elif d < 2380.0:
                target_spd = 120.0
                accel_rate = 52.0
            elif d < 3200.0:
                target_spd = 215.0
                accel_rate = 16.0
            elif d < 3980.0:
                target_spd = 328.0
                accel_rate = 15.0
            elif d < 4380.0:
                target_spd = 185.0
                accel_rate = 45.0
            elif d < 5300.0:
                target_spd = 332.0
                accel_rate = 16.0
            else:
                target_spd = 230.0
                accel_rate = 22.0

            # Smooth speed convergence via vehicle dynamics
            if self.speed < target_spd:
                self.speed = min(target_spd, self.speed + accel_rate * dt)
            else:
                self.speed = max(target_spd, self.speed - accel_rate * dt)

            # 3. Deterministic Closing Speed & Gap
            drs_active = 1 if (in_drs_zone and self.gap_dist_m <= 75.0) else 0
            if in_braking_zone:
                # Late-braking attack delta
                target_closing = 12.8 if drs_active else 5.5
            elif in_drs_zone:
                target_closing = 11.2 if drs_active else 2.8
            else:
                target_closing = 1.6

            # Smooth closing speed rate
            self.closing_speed += (target_closing - self.closing_speed) * (1.8 * dt)

            # Physics-based gap distance integration
            closing_mps = self.closing_speed / 3.6
            self.gap_dist_m = max(4.2, min(95.0, self.gap_dist_m - closing_mps * dt))
            # Gap in seconds
            gap_seconds = max(0.12, self.gap_dist_m / max(35.0, self.speed / 3.6))

            # 4. ERS Battery (SOC) Dynamics
            if in_braking_zone:
                # MGU-K kinetic energy harvesting during braking
                self.soc = min(0.96, self.soc + 0.038 * dt)
            elif in_drs_zone and self.closing_speed > 6.0:
                # Overtake Mode 4 deployment on straights
                self.soc = max(0.12, self.soc - 0.024 * dt)
            else:
                # Balanced deployment
                self.soc = max(0.18, self.soc - 0.006 * dt)

            # 5. Stewards Legality Telemetry Signals
            defender_late = bool(in_braking_zone and gap_seconds < 0.45 and self.closing_speed > 10.0 and (int(d) % 2 == 0))
            axle_overlap = bool(gap_seconds < 0.32 or (in_braking_zone and gap_seconds < 0.50 and self.closing_speed > 8.0))

            state = SharedFeatureState(
                soc=float(np.clip(self.soc, 0.05, 0.98)),
                lap_frac_remaining=max(0.0, 1.0 - self.lap / self.cfg.stint_laps),
                gap_to_ahead_s=round(gap_seconds, 3),
                sector_delta_s=self.sector_delta,
                tyre_age_delta=0.0,
                base_laptime_norm=1.0,
                closing_speed_kph=round(self.closing_speed, 1),
                gap_distance_m=round(self.gap_dist_m, 1),
                drs_available=drs_active,
                defender_line_change_late=defender_late,
                front_axle_overlap=axle_overlap,
            )
            v_dyn = compute_f1_dynamics(self.speed, self.prev_speed, dt, self.soc, in_braking_zone, drs_active)
            self.prev_speed = self.speed

            setattr(state, "speed_kph", round(self.speed, 1))
            setattr(state, "lap", int(self.lap))
            setattr(state, "tyre_life_pct", round(self.tyre_life, 1))
            setattr(state, "track_distance_m", round(self.track_dist, 1))
            setattr(state, "in_braking_zone", in_braking_zone)
            setattr(state, "in_drs_zone", in_drs_zone)
            setattr(state, "gear", v_dyn["gear"])
            setattr(state, "rpm", v_dyn["rpm"])
            setattr(state, "throttle", v_dyn["throttle"])
            setattr(state, "brake", v_dyn["brake"])
            setattr(state, "tyre_temps", v_dyn["tyre_temps"])
            setattr(state, "telemetry_source", "PHYSICS_SIMULATION")
            yield state
            await asyncio.sleep(period)


class ReplayTelemetrySource:
    """
    Continuous Replay Mode streaming realistic telemetry records from the
    90,002-row Monza Grand Prix dataset (data/telemetry.csv).
    """

    def __init__(self, config: TelemetryConfig = TelemetryConfig(), csv_path: str = None):
        self.cfg = config
        self.rows = []
        self.idx = 0
        self.prev_speed = 318.0
        self.t_last = time.time()
        self._load_data(csv_path)

    def _load_data(self, explicit_path: str = None):
        candidates = []
        if explicit_path:
            candidates.append(explicit_path)
        candidates.extend([
            os.path.join(os.path.dirname(__file__), "data", "telemetry.csv"),
            os.path.join(os.path.dirname(__file__), "..", "..", "data", "telemetry.csv"),
            "backend/data/telemetry.csv",
            "data/telemetry.csv",
            "../data/telemetry.csv",
        ])
        target = next((c for c in candidates if os.path.exists(c)), None)
        if target:
            try:
                import pandas as pd
                df = pd.read_csv(target)
                self.rows = df.to_dict(orient="records")
                print(f"[ReplayTelemetrySource] Loaded {len(self.rows)} rows from {target}")
            except Exception as e:
                print(f"[ReplayTelemetrySource] Error loading {target}: {e}")

    async def stream(self):
        if not self.rows:
            print("[ReplayTelemetrySource] No dataset available, falling back to SyntheticTelemetrySource")
            synth = SyntheticTelemetrySource(self.cfg)
            async for s in synth.stream():
                yield s
            return

        period = 1.0 / self.cfg.hz
        while True:
            t_now = time.time()
            dt = min(0.1, max(0.01, t_now - self.t_last))
            self.t_last = t_now

            row = self.rows[self.idx]
            self.idx = (self.idx + 1) % len(self.rows)

            speed = float(row.get("speed_kph", 312.0))
            soc = float(row.get("battery_soc_pct", 68.0)) / 100.0
            gap = max(0.05, float(row.get("gap_sec", 0.5)))
            closing = float(row.get("closing_speed_kph", 5.0))
            drs = 1 if str(row.get("drs_available", False)).lower() in ("true", "1") else 0
            lap = int(row.get("lap", 1))
            t_in_lap = float(row.get("t_in_lap", 0.0))
            tyre_age = float(row.get("tyre_age", lap))
            tyre_life = max(15.0, 100.0 - tyre_age * 2.5)

            in_braking = bool(closing > 8.0 and speed < 200.0)
            v_dyn = compute_f1_dynamics(speed, self.prev_speed, dt, soc, in_braking=in_braking, drs_active=bool(drs))
            self.prev_speed = speed

            state = SharedFeatureState(
                soc=float(np.clip(soc, 0.05, 0.98)),
                lap_frac_remaining=max(0.0, 1.0 - (lap % 53) / 53.0),
                gap_to_ahead_s=round(gap, 3),
                sector_delta_s=-0.214,
                tyre_age_delta=0.0,
                base_laptime_norm=1.0,
                closing_speed_kph=round(closing, 1),
                gap_distance_m=round(gap * (speed / 3.6), 1),
                drs_available=drs,
                defender_line_change_late=bool(gap < 0.45 and closing > 8.0),
                front_axle_overlap=bool(gap < 0.35 and closing > 6.0),
            )
            setattr(state, "speed_kph", round(speed, 1))
            setattr(state, "lap", int(lap))
            setattr(state, "tyre_life_pct", round(tyre_life, 1))
            setattr(state, "track_distance_m", round(t_in_lap * 5793.0, 1))
            setattr(state, "in_braking_zone", in_braking)
            setattr(state, "in_drs_zone", bool(drs))
            setattr(state, "gear", v_dyn["gear"])
            setattr(state, "rpm", v_dyn["rpm"])
            setattr(state, "throttle", v_dyn["throttle"])
            setattr(state, "brake", v_dyn["brake"])
            setattr(state, "tyre_temps", v_dyn["tyre_temps"])
            setattr(state, "telemetry_source", "REPLAY_MODE")

            yield state
            await asyncio.sleep(period)


class UDPTelemetrySource:
    """
    Real 20 Hz UDP listener. Point your sim's telemetry output at
    (bind_host, bind_port) and implement parse_packet() for your sim.
    """

    def __init__(self, bind_host="0.0.0.0", bind_port=20777,
                 config: TelemetryConfig = TelemetryConfig()):
        self.bind_host = bind_host
        self.bind_port = bind_port
        self.cfg = config

    def parse_packet(self, data: bytes) -> SharedFeatureState | None:
        """
        STUB: replace with your sim's real struct layout.
        Example shape for illustration only (NOT a real spec):
            soc, gap, sector_delta, tyre_delta, closing_speed, drs = struct.unpack(
                "<ffffff", data[:24]
            )
        Return None for packets you don't care about (e.g. non-telemetry
        packet types in a multi-packet-type protocol like F1 24's).
        """
        try:
            soc, gap, sector_delta, tyre_delta, closing_speed, drs = struct.unpack(
                "<fffffB", data[:21]
            )
        except struct.error:
            return None

        return SharedFeatureState(
            soc=float(np.clip(soc, 0, 1)),
            lap_frac_remaining=0.5,  # wire up real lap counter from the packet
            gap_to_ahead_s=float(gap),
            sector_delta_s=float(sector_delta),
            tyre_age_delta=float(tyre_delta),
            base_laptime_norm=1.0,
            closing_speed_kph=float(closing_speed),
            gap_distance_m=float(gap) * 60.0,
            drs_available=int(drs),
        )

    async def stream(self):
        loop = asyncio.get_event_loop()
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setblocking(False)
        sock.bind((self.bind_host, self.bind_port))
        print(f"[UDPTelemetrySource] listening on {self.bind_host}:{self.bind_port}")

        while True:
            try:
                data = await loop.sock_recv(sock, 4096)
            except (BlockingIOError, ConnectionResetError):
                await asyncio.sleep(0.001)
                continue
            state = self.parse_packet(data)
            if state is not None:
                yield state
