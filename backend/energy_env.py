"""
energy_env.py — Long-Horizon Energy Deployment environment for APEX PULSE.

A Gymnasium environment where an agent chooses a battery deployment MODE
each lap (Harvest / Balance / Push / Overtake) over a full stint, subject
to FIA hybrid limits. The reward is net lap-time saved, penalized for any
rule violation (which should never actually occur once the Compliance
Guard is wired in downstream — here we also penalize in training so the
policy learns to avoid violations on its own).

FIA-style limits modeled (illustrative, tune to the exact regs you target):
    MAX_DEPLOY_MJ_PER_LAP   = 4.0     # MGU-K energy deployed to the wheels
    MAX_RECOVERY_MJ_PER_LAP = 2.0     # MGU-K energy recovered under braking
    MAX_MGUK_POWER_KW       = 120.0   # instantaneous MGU-K power cap

State vector (shared feature state, also consumed by the XGBoost advisor):
    [ soc, lap_frac_remaining, gap_to_car_ahead, sector_delta,
      tyre_age_delta, base_laptime_norm ]

Action space (Discrete):
    0 = HARVEST   -> negative net deployment, banks SOC, small time cost
    1 = BALANCE   -> neutral deployment, ~sustainable baseline
    2 = PUSH      -> high deployment, faster lap, higher SOC burn
    3 = OVERTAKE  -> max legal deployment burst, largest time gain, largest SOC burn

Install: pip install gymnasium stable-baselines3 numpy
"""
from __future__ import annotations

import numpy as np
import gymnasium as gym
from gymnasium import spaces

# ---- FIA-style hybrid limits (tune these to your exact target regs) ----
MAX_DEPLOY_MJ_PER_LAP = 4.0
MAX_RECOVERY_MJ_PER_LAP = 2.0
MAX_MGUK_POWER_KW = 120.0

MODES = ["HARVEST", "BALANCE", "PUSH", "OVERTAKE"]

# Per-mode nominal energy deployment (MJ) and lap-time delta (s, negative = faster)
MODE_PROFILE = {
    "HARVEST":  dict(deploy_mj=-1.5, laptime_delta=+0.35, soc_delta=+0.06),
    "BALANCE":  dict(deploy_mj=+1.0, laptime_delta=+0.00, soc_delta=-0.02),
    "PUSH":     dict(deploy_mj=+2.8, laptime_delta=-0.28, soc_delta=-0.07),
    "OVERTAKE": dict(deploy_mj=+4.0, laptime_delta=-0.55, soc_delta=-0.11),
}


class EnergyDeploymentEnv(gym.Env):
    metadata = {"render_modes": ["human"]}

    def __init__(self, stint_laps: int = 30, seed: int | None = None):
        super().__init__()
        self.stint_laps = stint_laps
        self.rng = np.random.default_rng(seed)

        # obs: [soc(0-1), lap_frac_remaining(0-1), gap_to_ahead(s, 0-10 clip),
        #       sector_delta(s, -2..2), tyre_age_delta(laps, -20..20), base_laptime_norm(0-1)]
        low = np.array([0.0, 0.0, 0.0, -2.0, -20.0, 0.0], dtype=np.float32)
        high = np.array([1.0, 1.0, 10.0, 2.0, 20.0, 1.0], dtype=np.float32)
        self.observation_space = spaces.Box(low=low, high=high, dtype=np.float32)
        self.action_space = spaces.Discrete(len(MODES))

        self._reset_state()

    def _reset_state(self):
        self.lap = 0
        self.soc = 0.55  # start mid-charge
        self.gap_to_ahead = self.rng.uniform(0.5, 6.0)
        self.sector_delta = 0.0
        self.tyre_age_delta = 0.0
        self.base_laptime_norm = 1.0

    def _obs(self):
        lap_frac_remaining = 1.0 - (self.lap / self.stint_laps)
        return np.array(
            [self.soc, lap_frac_remaining, self.gap_to_ahead,
             self.sector_delta, self.tyre_age_delta, self.base_laptime_norm],
            dtype=np.float32,
        )

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        if seed is not None:
            self.rng = np.random.default_rng(seed)
        self._reset_state()
        return self._obs(), {}

    def step(self, action: int):
        mode = MODES[action]
        profile = MODE_PROFILE[mode]

        # -- Compliance check (mirrors the runtime Compliance Guard) --
        violated = False
        deploy_mj = profile["deploy_mj"]
        if deploy_mj > MAX_DEPLOY_MJ_PER_LAP:
            deploy_mj = MAX_DEPLOY_MJ_PER_LAP
            violated = True
        if deploy_mj < -MAX_RECOVERY_MJ_PER_LAP:
            deploy_mj = -MAX_RECOVERY_MJ_PER_LAP
            violated = True
        if self.soc <= 0.03 and deploy_mj > 0:
            # can't deploy from an empty battery -> forced harvest
            deploy_mj = -0.5
            mode = "HARVEST"

        # -- update SOC / track state --
        self.soc = float(np.clip(self.soc + profile["soc_delta"], 0.0, 1.0))
        self.gap_to_ahead = float(np.clip(
            self.gap_to_ahead - (0.15 if mode in ("PUSH", "OVERTAKE") else -0.02)
            + self.rng.normal(0, 0.05), 0.0, 12.0))
        self.sector_delta = float(np.clip(
            self.sector_delta + self.rng.normal(0, 0.15), -2.0, 2.0))
        self.tyre_age_delta = float(np.clip(
            self.tyre_age_delta + (0.4 if mode in ("PUSH", "OVERTAKE") else -0.1),
            -20.0, 20.0))

        laptime_delta = profile["laptime_delta"]

        # reward = net time saved (negative laptime_delta is good) - violation penalty
        # - a small shaping term that discourages running the battery to zero
        #   right before the stint ends (wasted energy) and discourages hoarding
        #   charge with laps left (missed opportunity).
        reward = -laptime_delta
        if violated:
            reward -= 5.0  # heavy penalty so the policy learns to self-limit
        reward -= 0.5 * max(0.0, 0.05 - self.soc)  # near-empty penalty
        lap_frac_remaining = 1.0 - (self.lap / self.stint_laps)
        if lap_frac_remaining < 0.1 and self.soc > 0.5:
            reward -= 0.3  # banked energy wasted at end of stint

        self.lap += 1
        terminated = self.lap >= self.stint_laps
        truncated = False
        info = {"mode": mode, "violated": violated, "deploy_mj": deploy_mj}

        return self._obs(), reward, terminated, truncated, info

    def render(self):
        print(f"Lap {self.lap:02d} | SOC {self.soc:.2f} | "
              f"Gap {self.gap_to_ahead:.2f}s | dSector {self.sector_delta:+.2f}s")
