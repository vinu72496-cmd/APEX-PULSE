"""
inference.py — Shared Feature State + Dual Model Core inference wrapper.

Both models read from the SAME feature vector (single source of truth),
so the PPO's lap-scale plan and the XGBoost's instant overtake read are
always reasoning about the same snapshot of the world.
"""
from dataclasses import dataclass
import os
import numpy as np

from compliance_guard import ComplianceGuard, RawRecommendation, DeployMode, MODE_DEPLOY_MJ
from feature_state import SharedFeatureState
from overtake_legality import assess_overtake_legality

def _find_model_path(filename: str) -> str:
    candidates = [
        os.path.join(os.path.dirname(__file__), "models", filename),
        os.path.join(os.path.dirname(__file__), "app", "models", filename),
        os.path.join(os.path.dirname(__file__), "..", "models", filename),
        os.path.join(os.getcwd(), "models", filename),
        os.path.join(os.getcwd(), "backend", "models", filename),
    ]
    for p in candidates:
        if os.path.exists(p):
            return os.path.abspath(p)
    return os.path.join(os.path.dirname(__file__), "models", filename)

PPO_PATH = _find_model_path("ppo_energy.zip")
XGB_PATH = _find_model_path("xgb_overtake.json")


class DualModelCore:
    """Loads both models once and produces guarded recommendations per tick."""

    def __init__(self):
        self.guard = ComplianceGuard()
        self.ppo_model = None
        self.xgb_model = None
        self.prev_prob = None
        self.prev_ev = None
        self.tick_counter = 0
        self._load_models()

    def _load_models(self):
        try:
            from stable_baselines3 import PPO
            if os.path.exists(PPO_PATH):
                self.ppo_model = PPO.load(PPO_PATH)
        except Exception as e:
            print(f"[DualModelCore] PPO model not loaded ({e}); using heuristic fallback.")

        try:
            import xgboost as xgb
            if os.path.exists(XGB_PATH):
                self.xgb_model = xgb.XGBClassifier()
                self.xgb_model.load_model(XGB_PATH)
        except Exception as e:
            print(f"[DualModelCore] XGBoost model not loaded ({e}); using heuristic fallback.")

    def _ppo_mode(self, state: SharedFeatureState) -> DeployMode:
        modes = list(DeployMode)
        if self.ppo_model is not None:
            action, _ = self.ppo_model.predict(state.ppo_obs(), deterministic=True)
            return modes[int(action)]
        # heuristic fallback if model file isn't present yet (e.g. pre-training demo)
        if state.soc < 0.15:
            return DeployMode.HARVEST
        if state.gap_to_ahead_s < 1.0:
            return DeployMode.OVERTAKE
        if state.soc > 0.7:
            return DeployMode.PUSH
        return DeployMode.BALANCE

    def _calculate_logical_overtake_probability(self, state: SharedFeatureState, battery_cost_mj: float) -> tuple[float, float]:
        """
        Calculates a transparent, multi-factor racing probability (0-100%)
        blended with the trained XGBoost classifier.
        """
        gap = float(state.gap_to_ahead_s)
        closing_spd = float(getattr(state, "closing_speed_kph", 0.0))
        drs = int(getattr(state, "drs_available", 0))
        soc = float(state.soc)
        tyre_life = float(getattr(state, "tyre_life_pct", 82.0))
        pace_adv = -float(getattr(state, "sector_delta_s", -0.15))
        in_braking = bool(getattr(state, "in_braking_zone", False))
        in_drs_zone = bool(getattr(state, "in_drs_zone", False))

        # 1. Gap Score (25% weight)
        if gap <= 0.35:
            gap_score = 96.0
        elif gap <= 0.55:
            gap_score = 88.0
        elif gap <= 0.85:
            gap_score = 72.0
        elif gap <= 1.20:
            gap_score = 48.0
        else:
            gap_score = max(10.0, 48.0 - (gap - 1.2) * 22.0)

        # 2. Closing Speed Score (20% weight)
        if closing_spd >= 12.0:
            speed_score = 95.0
        elif closing_spd >= 7.0:
            speed_score = 82.0
        elif closing_spd >= 2.0:
            speed_score = 64.0
        elif closing_spd >= -2.0:
            speed_score = 42.0
        else:
            speed_score = 15.0

        # 3. DRS Availability (15% weight)
        drs_score = 92.0 if drs else 22.0

        # 4. ERS State of Charge (15% weight)
        if soc >= 0.65:
            ers_score = 95.0
        elif soc >= 0.40:
            ers_score = 78.0
        elif soc >= 0.20:
            ers_score = 45.0
        elif soc >= 0.12:
            ers_score = 25.0
        else:
            ers_score = 6.0

        # 5. Tyre Life & Compound Condition (10% weight)
        if tyre_life >= 75.0:
            tyre_score = 90.0
        elif tyre_life >= 50.0:
            tyre_score = 72.0
        elif tyre_life >= 30.0:
            tyre_score = 45.0
        else:
            tyre_score = 15.0

        # 6. Track Sector & Passing Geometry (10% weight)
        if in_drs_zone:
            track_score = 92.0
        elif in_braking:
            track_score = 86.0
        else:
            track_score = 40.0

        # 7. Pace Advantage (5% weight)
        pace_score = 85.0 if pace_adv > 0.10 else (60.0 if pace_adv >= 0.0 else 30.0)

        # Weighted multi-factor score
        weighted_score = (
            gap_score * 0.25 +
            speed_score * 0.20 +
            drs_score * 0.15 +
            ers_score * 0.15 +
            tyre_score * 0.10 +
            track_score * 0.10 +
            pace_score * 0.05
        )

        # Blend with XGBoost model when available
        if self.xgb_model is not None:
            try:
                xgb_p = float(self.xgb_model.predict_proba(state.xgb_row(battery_cost_mj))[0, 1]) * 100.0
                raw_prob = 0.50 * weighted_score + 0.50 * xgb_p
            except Exception:
                raw_prob = weighted_score
        else:
            raw_prob = weighted_score

        # Guarded intervention or extreme low battery cap
        if soc < 0.12:
            raw_prob = min(raw_prob, 18.0)

        confidence = min(0.98, max(0.80, 0.85 + (raw_prob - 50.0) * 0.002))
        return float(np.clip(raw_prob, 5.0, 96.0)), confidence

    def recommend(self, state: SharedFeatureState) -> dict:
        self.tick_counter += 1
        mode = self._ppo_mode(state)
        battery_cost_mj = max(0.0, MODE_DEPLOY_MJ[mode])

        # 1. Compute deterministic raw probability from meaningful racing factors
        raw_prob, confidence_val = self._calculate_logical_overtake_probability(state, battery_cost_mj)

        # 2. Temporal Exponential Moving Average (EMA) Smoothing & Slew Limiting
        # smoothedProbability = previousProbability * 0.75 + newCalculatedProbability * 0.25
        if self.prev_prob is None or getattr(state, "reset_ema", False):
            smoothed_prob = raw_prob
        else:
            diff = raw_prob - self.prev_prob
            if abs(diff) > 25.0:
                smoothed_prob = self.prev_prob + float(np.sign(diff) * min(abs(diff), 10.0))
            else:
                ema = self.prev_prob * 0.75 + raw_prob * 0.25
                delta = float(np.clip(ema - self.prev_prob, -1.8, 1.8))
                smoothed_prob = self.prev_prob + delta

        self.prev_prob = smoothed_prob
        prob_pct = round(float(np.clip(smoothed_prob, 5.0, 95.0)), 1)
        prob_ratio = prob_pct / 100.0

        # 3. Guard compliance check
        raw_rec = RawRecommendation(
            mode=mode,
            overtake_go=(prob_pct >= 55.0),
            overtake_confidence=round(confidence_val, 3),
            requested_deploy_mj=MODE_DEPLOY_MJ[mode],
            mguk_power_kw=110.0 if mode in (DeployMode.PUSH, DeployMode.OVERTAKE) else 60.0,
        )
        guarded = self.guard.check(raw_rec, soc=state.soc)
        if guarded.infringement_flagged:
            prob_pct = min(prob_pct, 12.0)
            prob_ratio = prob_pct / 100.0

        # 4. Canonical Expected Value (EV), Reward & Risk Calculation
        # Formula: EV = (Probability × Reward) - ((1 - Probability) × Risk)
        pace_adv = round(-float(getattr(state, "sector_delta_s", -0.15)), 2)
        drs_active = bool(getattr(state, "drs_available", 0) or state.gap_to_ahead_s < 1.0)
        closing_spd = round(float(getattr(state, "closing_speed_kph", 8.5 if drs_active else 2.0)), 1)
        tyre_life = round(float(getattr(state, "tyre_life_pct", 82.0)), 1)
        soc_pct = round(float(state.soc) * 100.0, 1)

        # Reward in seconds (net lap time advantage gained if overtake succeeds)
        reward_s = round(2.4 + (0.5 if drs_active else 0.0) + (0.3 if pace_adv > 0.1 else 0.0), 2)
        # Risk in seconds (expected lap time loss if attack fails: tyre scrub, lost apex, counter-attack)
        risk_s = round(4.2 + (2.6 if state.soc < 0.20 else 0.0) + (1.4 if tyre_life < 40.0 else 0.0), 2)

        # Authoritative EV in seconds
        expected_value_s = round((prob_ratio * reward_s) - ((1.0 - prob_ratio) * risk_s), 2)
        ev_favourable = bool(expected_value_s > 0)

        # 0-100 normalized scores for telemetry gauge chips
        reward_score = round(float(np.clip(35.0 + 30.0 * (1 if drs_active else 0) + 30.0 * (1.0 - min(1.5, state.gap_to_ahead_s)/1.5), 15.0, 95.0)), 1)
        risk_score = round(float(np.clip(30.0 + 40.0 * (1.0 - state.soc) + 25.0 * (1.0 - tyre_life/100.0), 12.0, 98.0)), 1)
        risk_ratio = round(risk_score / max(1.0, reward_score), 2)
        risk_ratio_str = f"{risk_ratio:.2f}:1"

        # 5. Explainable AI Factor Generation (WHY vs RISK)
        why_factors = []
        if drs_active:
            why_factors.append("DRS wing open (Zone 1 speed advantage)")
        if closing_spd > 4.0:
            why_factors.append(f"+{closing_spd:.1f} km/h radar closing delta")
        if state.gap_to_ahead_s <= 0.70:
            why_factors.append(f"In slipstream attack pocket ({state.gap_to_ahead_s:.2f}s)")
        if state.soc >= 0.35:
            why_factors.append(f"ERS battery ({soc_pct:.0f}%) ready for Mode 4 boost")
        if pace_adv > 0.0:
            why_factors.append(f"Sector pace advantage (+{pace_adv:.2f}s)")
        if not why_factors:
            why_factors.append("Maintaining race delta in DRS train")

        risk_factors = []
        if bool(getattr(state, "in_braking_zone", False)) or state.gap_to_ahead_s < 0.45:
            risk_factors.append("Heavy braking zone divebomb hazard (T1 Rettifilo)")
        if state.soc < 0.25:
            risk_factors.append(f"Low battery ({soc_pct:.0f}% SOC) - de-rate hazard")
        if tyre_life < 45.0:
            risk_factors.append(f"Tyre wear cliff ({tyre_life:.0f}% life remaining)")
        if not drs_active:
            risk_factors.append("Aero drag penalty in dirty air wake")
        if not risk_factors:
            risk_factors.append("Optimal line; minimal risk detected")

        # 6. Final Decision Action
        if guarded.infringement_flagged:
            action = "ABORT ATTACK"
            action_reason = guarded.infringement_reasons[0] if guarded.infringement_reasons else "Compliance Guard veto"
        elif state.soc < 0.12:
            action = "SAVE ERS"
            action_reason = f"SOC {soc_pct:.0f}% below deployment threshold"
        elif prob_pct >= 68.0 and expected_value_s > 0 and state.soc >= 0.30:
            action = "OVERTAKE NOW"
            action_reason = f"Positive EV (+{expected_value_s:.2f}s) · Optimal DRS closing delta"
        elif prob_pct >= 48.0 and expected_value_s >= -0.5:
            action = "ATTACK"
            action_reason = f"Pressure rival · Gap {state.gap_to_ahead_s:.2f}s closing"
        elif expected_value_s < -1.0 or prob_pct < 40.0:
            action = "HOLD POSITION"
            action_reason = f"Negative EV ({expected_value_s:.2f}s) · Conserve battery"
        else:
            action = "DEFEND APEX"
            action_reason = "Protect track position and manage tyre thermals"

        lap = int(getattr(state, "lap", 30))
        speed = round(float(getattr(state, "speed_kph", 312.0)), 1)
        tyre_compound = "SOFT" if lap <= 18 else ("MEDIUM" if lap <= 38 else "HARD")

        # 7. FIA Stewards Overtake Legality Assessment
        legality = assess_overtake_legality(
            feature_state=state,
            defender_line_change_late=bool(getattr(state, "defender_line_change_late", False)),
            front_axle_overlap=bool(getattr(state, "front_axle_overlap", False)),
            gap_ahead_s=float(state.gap_to_ahead_s),
            closing_speed_kph=float(closing_spd),
            gap_distance_m=float(getattr(state, "gap_distance_m", state.gap_to_ahead_s * 60.0)),
        )

        return {
            "type": "decision",
            "mode": guarded.mode.value,
            "overtake_go": guarded.overtake_go,
            "overtake_confidence": round(confidence_val, 3),
            "overtake_probability": prob_pct,
            "probability": prob_pct,
            "expected_value_s": expected_value_s,
            "reward_s": reward_s,
            "risk_s": risk_s,
            "ev_favourable": ev_favourable,
            "why_factors": why_factors,
            "risk_factors": risk_factors,
            "overtake_legality": legality,
            "defender_line_change_late": bool(getattr(state, "defender_line_change_late", False)),
            "front_axle_overlap": bool(getattr(state, "front_axle_overlap", False)),
            "reward_score": reward_score,
            "reward_label": "HIGH" if reward_score >= 70 else ("MEDIUM" if reward_score >= 40 else "LOW"),
            "risk_score": risk_score,
            "risk_label": "HIGH" if risk_score >= 65 else ("MEDIUM" if risk_score >= 35 else "LOW"),
            "risk_ratio": risk_ratio,
            "risk_ratio_str": risk_ratio_str,
            "action": action,
            "action_reason": action_reason,
            "pace_advantage_s": pace_adv,
            "deploy_mj": round(guarded.deploy_mj, 2),
            "lap_budget_mj": round(guarded.deploy_mj, 2),
            "mguk_power_kw": round(guarded.mguk_power_kw, 1),
            "soc": round(state.soc, 3),
            "gap_to_ahead_s": round(state.gap_to_ahead_s, 2),
            "gap_ahead_s": round(state.gap_to_ahead_s, 2),
            "speed_kph": speed,
            "closing_speed_kph": closing_spd,
            "drs_available": drs_active,
            "lap": lap,
            "tyre_compound": tyre_compound,
            "tyre_life_pct": tyre_life,
            "tyre_deg_rate": "0.082 s/lap",
            "pit_window": "Laps 20 - 24",
            "gap_behind_s": round(1.45 + (0.1 if lap % 2 == 0 else -0.05), 2),
            "car_behind": "SAI #55",
            "car_ahead": "LEC #16",
            "current_position": 1,
            "predicted_position": 1,
            "best_case_position": 1,
            "worst_case_position": 2,
            "ers_recommended_mode": "MODE 4 (OVERTAKE 120kW)" if guarded.mode.value == "OVERTAKE" else ("MODE 2 (HARVEST 60kW)" if state.soc < 0.2 else "MODE 3 (BALANCED 90kW)"),
            "ers_deploy_est_pct": max(5, round((state.soc - 0.18) * 100)) if guarded.mode.value == "OVERTAKE" else round(state.soc * 100),
            "infringement_flagged": guarded.infringement_flagged,
            "guard_intervened": guarded.infringement_flagged,
            "infringement_reasons": list(guarded.infringement_reasons),
            "guard_reasons": list(guarded.infringement_reasons),
        }
