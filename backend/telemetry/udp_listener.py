"""
backend/telemetry/udp_listener.py — F1 24 UDP Telemetry Ingest & Parser.

Specification Reference:
    Official EA Sports F1 24 UDP Telemetry Specification (Packet Format 2024 / Version 1.0, May 2024).
    Published by Codemasters / Electronic Arts.

This module implements:
    1. Header parsing (29 bytes, '<HBBBBBQfIIBB')
    2. PacketCarTelemetryData (Packet ID 6, 22 cars * 60 bytes each, '<HfffBbHBBH4H4B4BH4f4B')
    3. PacketLapData (Packet ID 2, 22 cars * 57 bytes each in F1 24, '<IIHBHBHBHBfffBBBBBBBBBBBBBBHHBfB')
    4. PacketCarStatusData (Packet ID 7, ERS energy store / battery state of charge)
    5. Mock packet support for integration testing and simulated feeds.
"""
import asyncio
import json
import socket
import struct
import time
from dataclasses import dataclass
from typing import Optional

import numpy as np

try:
    from inference import SharedFeatureState
except ImportError:
    from ..inference import SharedFeatureState


# --- F1 24 SPECIFICATION CONSTANTS (Format 2024) ---
# Header: 29 bytes
PACKET_HEADER_FORMAT = "<HBBBBBQfIIBB"
PACKET_HEADER_SIZE = struct.calcsize(PACKET_HEADER_FORMAT)  # 29 bytes

# Packet IDs per EA Sports F1 24 UDP Spec
PACKET_ID_MOTION = 0
PACKET_ID_SESSION = 1
PACKET_ID_LAP_DATA = 2
PACKET_ID_EVENT = 3
PACKET_ID_PARTICIPANTS = 4
PACKET_ID_CAR_SETUPS = 5
PACKET_ID_CAR_TELEMETRY = 6
PACKET_ID_CAR_STATUS = 7

# Car Telemetry struct for a single car (60 bytes)
# Speed(uint16), Throttle(f32), Steer(f32), Brake(f32), Clutch(u8), Gear(i8),
# EngineRPM(u16), DRS(u8), RevLights%(u8), RevLightsBit(u16), BrakesTemp[4](4*u16),
# TyresSurfaceTemp[4](4*u8), TyresInnerTemp[4](4*u8), EngineTemp(u16),
# TyresPressure[4](4*f32), SurfaceType[4](4*u8)
CAR_TELEMETRY_FORMAT = "<HfffBbHBBH4H4B4BH4f4B"
CAR_TELEMETRY_SIZE = struct.calcsize(CAR_TELEMETRY_FORMAT)  # 60 bytes

# Lap Data struct for a single car in F1 24 (57 bytes)
# m_lastLapTimeInMS(u32), m_currentLapTimeInMS(u32), m_sector1TimeMSPart(u16),
# m_sector1TimeMinutesPart(u8), m_sector2TimeMSPart(u16), m_sector2TimeMinutesPart(u8),
# m_deltaToCarInFrontMSPart(u16), m_deltaToCarInFrontMinutesPart(u8),
# m_deltaToRaceLeaderMSPart(u16), m_deltaToRaceLeaderMinutesPart(u8),
# m_lapDistance(f32), m_totalDistance(f32), m_safetyCarDelta(f32), m_carPosition(u8),
# m_currentLapNum(u8), m_pitStatus(u8), m_numPitStops(u8), m_sector(u8),
# m_currentLapInvalid(u8), m_penalties(u8), m_totalWarnings(u8), m_cornerCuttingWarnings(u8),
# m_numUnservedDriveThroughPens(u8), m_numUnservedStopGoPens(u8), m_gridPosition(u8),
# m_driverStatus(u8), m_resultStatus(u8), m_pitLaneTimerActive(u8),
# m_pitLaneTimeInLaneInMS(u16), m_pitStopTimerInMS(u16), m_pitStopShouldServePen(u8),
# m_speedTrapFastestSpeed(f32), m_speedTrapFastestLap(u8)
LAP_DATA_FORMAT = "<IIHBHBHBHBfffBBBBBBBBBBBBBBHHBfB"
LAP_DATA_SIZE = struct.calcsize(LAP_DATA_FORMAT)  # 57 bytes

MAX_CARS = 22
MAX_ERS_JOULES = 4_000_000.0  # 4 MJ capacity per FIA regulations / F1 24 spec


@dataclass
class TelemetryConfig:
    stint_laps: int = 30
    hz: float = 20.0


class F124TelemetryParser:
    """
    Maintains persistent race state across incoming F1 24 UDP packet streams
    and maps them to SharedFeatureState.
    """

    def __init__(self, stint_laps: int = 30):
        self.stint_laps = stint_laps
        self.soc = 0.60
        self.lap = 1
        self.lap_frac_remaining = 1.0
        self.gap_to_ahead_s = 2.5
        self.sector_delta_s = 0.0
        self.tyre_age_delta = 0.0
        self.closing_speed_kph = 0.0
        self.gap_distance_m = 150.0
        self.drs_available = 0
        self.speed_kph = 250.0
        self.last_speed = 250.0
        self.last_gap = 2.5
        self.last_update_time = time.time()

    def parse(self, data: bytes) -> Optional[SharedFeatureState]:
        # 1. Support Mock JSON packet
        if data.startswith(b'{') and data.endswith(b'}'):
            try:
                payload = json.loads(data.decode('utf-8'))
                self.soc = float(payload.get('soc', self.soc))
                self.gap_to_ahead_s = float(payload.get('gap_to_ahead_s', payload.get('gap', self.gap_to_ahead_s)))
                self.lap = int(payload.get('lap', self.lap))
                self.lap_frac_remaining = float(payload.get('lap_frac_remaining', max(0.0, 1.0 - self.lap / self.stint_laps)))
                self.sector_delta_s = float(payload.get('sector_delta_s', self.sector_delta_s))
                self.tyre_age_delta = float(payload.get('tyre_age_delta', self.tyre_age_delta))
                self.closing_speed_kph = float(payload.get('closing_speed_kph', self.closing_speed_kph))
                self.gap_distance_m = float(payload.get('gap_distance_m', self.gap_to_ahead_s * 60.0))
                self.drs_available = int(payload.get('drs_available', payload.get('drs', 0)))
                self.speed_kph = float(payload.get('speed_kph', self.speed_kph))
                state = SharedFeatureState(
                    soc=float(np.clip(self.soc, 0.0, 1.0)),
                    lap_frac_remaining=float(np.clip(self.lap_frac_remaining, 0.0, 1.0)),
                    gap_to_ahead_s=float(self.gap_to_ahead_s),
                    sector_delta_s=float(self.sector_delta_s),
                    tyre_age_delta=float(self.tyre_age_delta),
                    base_laptime_norm=1.0,
                    closing_speed_kph=float(self.closing_speed_kph),
                    gap_distance_m=float(self.gap_distance_m),
                    drs_available=int(self.drs_available),
                )
                setattr(state, 'speed_kph', self.speed_kph)
                setattr(state, 'lap', self.lap)
                return state
            except Exception:
                pass

        # 2. Support simplified legacy mock binary packet: '<fffffB' (21 bytes)
        if len(data) == 21:
            try:
                soc, gap, sector_delta, tyre_delta, closing_speed, drs = struct.unpack('<fffffB', data)
                self.soc = float(np.clip(soc, 0.0, 1.0))
                self.gap_to_ahead_s = float(gap)
                self.sector_delta_s = float(sector_delta)
                self.tyre_age_delta = float(tyre_delta)
                self.closing_speed_kph = float(closing_speed)
                self.drs_available = int(drs)
                self.gap_distance_m = float(gap * 60.0)
                state = SharedFeatureState(
                    soc=self.soc,
                    lap_frac_remaining=max(0.0, 1.0 - self.lap / self.stint_laps),
                    gap_to_ahead_s=self.gap_to_ahead_s,
                    sector_delta_s=self.sector_delta_s,
                    tyre_age_delta=self.tyre_age_delta,
                    base_laptime_norm=1.0,
                    closing_speed_kph=self.closing_speed_kph,
                    gap_distance_m=self.gap_distance_m,
                    drs_available=self.drs_available,
                )
                setattr(state, 'speed_kph', self.speed_kph)
                setattr(state, 'lap', self.lap)
                return state
            except struct.error:
                return None

        # 3. Check for minimum F1 24 header size
        if len(data) < PACKET_HEADER_SIZE:
            return None

        # Unpack F1 24 Header per May 2024 EA Spec
        try:
            (
                m_packetFormat,
                m_gameYear,
                m_gameMajorVersion,
                m_gameMinorVersion,
                m_packetVersion,
                m_packetId,
                m_sessionUID,
                m_sessionTime,
                m_frameIdentifier,
                m_overallFrameIdentifier,
                m_playerCarIndex,
                m_secondaryPlayerCarIndex,
            ) = struct.unpack_from(PACKET_HEADER_FORMAT, data, 0)
        except struct.error:
            return None

        player_idx = min(max(0, m_playerCarIndex), MAX_CARS - 1)

        # --- PACKET ID 6: CAR TELEMETRY ---
        if m_packetId == PACKET_ID_CAR_TELEMETRY:
            offset = PACKET_HEADER_SIZE + player_idx * CAR_TELEMETRY_SIZE
            if len(data) >= offset + CAR_TELEMETRY_SIZE:
                car_bytes = data[offset : offset + CAR_TELEMETRY_SIZE]
                unpacked = struct.unpack(CAR_TELEMETRY_FORMAT, car_bytes)
                speed = float(unpacked[0])
                drs = int(unpacked[7])
                self.speed_kph = speed
                self.drs_available = drs

        # --- PACKET ID 2: LAP DATA ---
        elif m_packetId == PACKET_ID_LAP_DATA:
            offset = PACKET_HEADER_SIZE + player_idx * LAP_DATA_SIZE
            if len(data) >= offset + LAP_DATA_SIZE:
                lap_bytes = data[offset : offset + LAP_DATA_SIZE]
                unpacked = struct.unpack(LAP_DATA_FORMAT, lap_bytes)
                delta_ms = float(unpacked[6])
                delta_min = float(unpacked[7])
                gap_s = delta_min * 60.0 + delta_ms / 1000.0
                if gap_s > 0.05:
                    dt = max(0.01, time.time() - self.last_update_time)
                    closing_rate = (self.last_gap - gap_s) / dt * 3.6  # m/s -> kph approx
                    self.closing_speed_kph = float(np.clip(closing_rate, -20.0, 50.0))
                    self.last_gap = gap_s
                    self.last_update_time = time.time()
                    self.gap_to_ahead_s = gap_s
                    self.gap_distance_m = gap_s * (self.speed_kph / 3.6)

                current_lap = int(unpacked[14])
                if current_lap > 0:
                    self.lap = current_lap
                    self.lap_frac_remaining = max(0.0, 1.0 - (self.lap / self.stint_laps))

        # --- PACKET ID 7: CAR STATUS (ERS / SOC) ---
        elif m_packetId == PACKET_ID_CAR_STATUS:
            try:
                car_status_size = 55
                offset = PACKET_HEADER_SIZE + player_idx * car_status_size
                if len(data) >= offset + 32:
                    ers_joules = struct.unpack_from('<f', data, offset + 28)[0]
                    if 0.0 <= ers_joules <= MAX_ERS_JOULES * 1.5:
                        self.soc = float(np.clip(ers_joules / MAX_ERS_JOULES, 0.0, 1.0))
            except Exception:
                pass

        state = SharedFeatureState(
            soc=float(np.clip(self.soc, 0.0, 1.0)),
            lap_frac_remaining=float(np.clip(self.lap_frac_remaining, 0.0, 1.0)),
            gap_to_ahead_s=float(self.gap_to_ahead_s),
            sector_delta_s=float(self.sector_delta_s),
            tyre_age_delta=float(self.tyre_age_delta),
            base_laptime_norm=1.0,
            closing_speed_kph=float(self.closing_speed_kph),
            gap_distance_m=float(self.gap_distance_m),
            drs_available=int(self.drs_available),
        )
        setattr(state, 'speed_kph', self.speed_kph)
        setattr(state, 'lap', self.lap)
        return state


class UDPListener:
    """
    Real 20 Hz UDP listener for sim telemetry with official F1 24 specification support.
    """

    def __init__(self, bind_host: str = "0.0.0.0", bind_port: int = 20777,
                 config: TelemetryConfig = TelemetryConfig()):
        self.bind_host = bind_host
        self.bind_port = bind_port
        self.cfg = config
        self.parser = F124TelemetryParser(stint_laps=config.stint_laps)

    def _parse_packet(self, data: bytes) -> Optional[SharedFeatureState]:
        """
        Parses incoming UDP telemetry packets against the official EA Sports F1 24 UDP Specification.
        """
        return self.parser.parse(data)

    def parse_packet(self, data: bytes) -> Optional[SharedFeatureState]:
        return self._parse_packet(data)

    async def stream(self):
        loop = asyncio.get_event_loop()
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setblocking(False)
        sock.bind((self.bind_host, self.bind_port))
        print(f"[UDPListener] listening on {self.bind_host}:{self.bind_port} (F1 24 UDP Spec v1.0)")

        while True:
            try:
                data = await loop.sock_recv(sock, 4096)
            except (BlockingIOError, ConnectionResetError):
                await asyncio.sleep(0.001)
                continue
            except asyncio.CancelledError:
                break

            state = self._parse_packet(data)
            if state is not None:
                yield state
        sock.close()
