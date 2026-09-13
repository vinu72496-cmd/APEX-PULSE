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
            setattr(state, "speed_kph", round(self.speed, 1))
            setattr(state, "lap", int(self.lap))
            setattr(state, "tyre_life_pct", round(self.tyre_life, 1))
            setattr(state, "track_distance_m", round(self.track_dist, 1))
            setattr(state, "in_braking_zone", in_braking_zone)
            setattr(state, "in_drs_zone", in_drs_zone)
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
