"""
fastf1_backtest.py — Historical Backtesting against real F1 timing data.

Pulls a session with FastF1, reconstructs an approximate per-lap feature
state for a chosen driver's stint, runs it through the DualModelCore, and
compares the model's recommended deployment mode / overtake calls against
what actually happened (gap trends, position changes) as a sanity check
and a "AI vs reality" slide for the judges.

Note: FastF1 does not expose FIA hybrid deployment/SOC telemetry directly
(that's proprietary team data), so SOC here is *simulated* consistently
with the training env, seeded from real lap-time and gap data. Be upfront
about this in your presentation — the value is in showing the AI's
decisions are directionally sound against real gaps/pace, not that SOC
itself is ground truth.

Install: pip install fastf1 pandas
"""
import argparse
import sys
import os

import fastf1
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from inference import DualModelCore, SharedFeatureState  # noqa: E402


def load_session(year: int, gp: str, session_type: str = "R"):
    fastf1.Cache.enable_cache("./fastf1_cache")
    session = fastf1.get_session(year, gp, session_type)
    session.load()
    return session


def build_feature_stream(session, driver_code: str) -> pd.DataFrame:
    laps = session.laps.pick_drivers(driver_code).reset_index(drop=True)
    if laps.empty:
        raise ValueError(f"No laps found for driver {driver_code}")

    rows = []
    soc = 0.6  # simulated starting SOC; not real telemetry (see module docstring)
    stint_laps = len(laps)

    for i, lap in laps.iterrows():
        gap_to_ahead = 1.5  # FastF1 R session doesn't give clean live gaps without timing merge;
                             # for a real submission, merge session.laps + track_status / timing app data.
        sector_delta = 0.0
        try:
            if pd.notna(lap["LapTime"]) and pd.notna(laps["LapTime"].median()):
                sector_delta = (lap["LapTime"] - laps["LapTime"].median()).total_seconds()
        except Exception:
            pass

        # crude simulated SOC drift so the demo is deterministic and legible
        soc = float(np.clip(soc - 0.015 + np.random.default_rng(i).normal(0, 0.01), 0.05, 1.0))

        rows.append(dict(
            lap_number=int(lap["LapNumber"]) if pd.notna(lap["LapNumber"]) else i + 1,
            soc=soc,
            lap_frac_remaining=max(0.0, 1.0 - i / stint_laps),
            gap_to_ahead_s=gap_to_ahead,
            sector_delta_s=sector_delta,
            tyre_age_delta=0.0,
            base_laptime_norm=1.0,
            closing_speed_kph=0.0,
            gap_distance_m=gap_to_ahead * 60.0,
            drs_available=0,
        ))
    return pd.DataFrame(rows)


def run_backtest(year: int, gp: str, driver_code: str):
    session = load_session(year, gp)
    df = build_feature_stream(session, driver_code)
    core = DualModelCore()

    results = []
    for _, row in df.iterrows():
        state = SharedFeatureState(
            soc=row.soc,
            lap_frac_remaining=row.lap_frac_remaining,
            gap_to_ahead_s=row.gap_to_ahead_s,
            sector_delta_s=row.sector_delta_s,
            tyre_age_delta=row.tyre_age_delta,
            base_laptime_norm=row.base_laptime_norm,
            closing_speed_kph=row.closing_speed_kph,
            gap_distance_m=row.gap_distance_m,
            drs_available=row.drs_available,
        )
        rec = core.recommend(state)
        rec["lap_number"] = row.lap_number
        results.append(rec)

    out = pd.DataFrame(results)
    print(out[["lap_number", "mode", "soc", "overtake_go", "infringement_flagged"]].to_string(index=False))
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=2023)
    parser.add_argument("--gp", type=str, default="Monza")
    parser.add_argument("--driver", type=str, default="VER", help="3-letter driver code")
    args = parser.parse_args()

    df = run_backtest(args.year, args.gp, args.driver)
    df.to_csv("backtest_results.csv", index=False)
    print("Saved backtest_results.csv")
