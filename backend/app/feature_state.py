"""
feature_state.py — Shared Feature State representation for telemetry & models.

Holds the canonical telemetry state vector fed to:
1. PPO energy optimizer (lap-scale mode recommendation)
2. XGBoost overtake advisor (real-time success likelihood)
3. FIA Stewards Overtake Legality Engine (rules-based compliance)
"""
from dataclasses import dataclass
import numpy as np


@dataclass
class SharedFeatureState:
    """The single telemetry vector fed to models and stewards legality engine, ~20 Hz."""
    soc: float                 # 0-1 state of charge
    lap_frac_remaining: float  # 0-1, fraction of stint remaining
    gap_to_ahead_s: float      # seconds
    sector_delta_s: float      # +/- seconds vs reference
    tyre_age_delta: float      # own - rival, laps
    base_laptime_norm: float   # 0-1 normalized reference pace
    # overtake-specific fields
    closing_speed_kph: float = 0.0
    gap_distance_m: float = 0.0
    drs_available: int = 0

    # -------------------------------------------------------------------------
    # FIA Stewards Overtake Legality Signals (Articles 27.4 & 33.4)
    # -------------------------------------------------------------------------
    # 1. defender_line_change_late: whether the defending car changed line
    #    within the final braking zone (moving under braking).
    #    Approximation: In telemetry, when direct CAN steering line data isn't
    #    present, this is detected when lateral delta shifts abruptly (>0.8m)
    #    during the final deceleration phase within 0.8s of the braking marker.
    defender_line_change_late: bool = False

    # 2. front_axle_overlap: whether the attacking car's front axle has drawn
    #    alongside the defender's mirror line by the corner apex.
    #    Approximation: In telemetry, this corresponds to physical gap_distance_m <= 3.6m
    #    (standard F1 wheelbase to cockpit mirror distance) or gap_to_ahead_s <= 0.25s.
    front_axle_overlap: bool = False

    def ppo_obs(self) -> np.ndarray:
        return np.array([
            self.soc, self.lap_frac_remaining, self.gap_to_ahead_s,
            self.sector_delta_s, self.tyre_age_delta, self.base_laptime_norm,
        ], dtype=np.float32)

    def xgb_row(self, battery_cost_mj: float) -> np.ndarray:
        return np.array([[
            self.closing_speed_kph, self.gap_distance_m, self.tyre_age_delta,
            self.drs_available, self.soc, battery_cost_mj,
        ]], dtype=np.float32)
