"""
compliance_guard.py — Hard Compliance Guard.

This is the single choke point every recommendation MUST pass through before
it reaches the dashboard. It never trusts the PPO or XGBoost outputs: it
re-derives the legal envelope itself and clips/overrides anything outside it.

Design principle: fail SAFE. If inputs are missing/malformed, default to the
most conservative legal mode (HARVEST / no-go) rather than guessing.
"""
from dataclasses import dataclass
from enum import Enum

# Configurable deployment limits (currently set to the brief's values: 4 MJ deploy / 2 MJ recover / 120kW)
MAX_DEPLOY_MJ_PER_LAP = 4.0
MAX_RECOVERY_MJ_PER_LAP = 2.0
MAX_MGUK_POWER_KW = 120.0
MIN_SOC_FOR_DEPLOY = 0.03  # can't legally/physically pull energy from empty battery


class DeployMode(str, Enum):
    HARVEST = "HARVEST"
    BALANCE = "BALANCE"
    PUSH = "PUSH"
    OVERTAKE = "OVERTAKE"


MODE_DEPLOY_MJ = {
    DeployMode.HARVEST: -1.5,
    DeployMode.BALANCE: 1.0,
    DeployMode.PUSH: 2.8,
    DeployMode.OVERTAKE: 4.0,
}


@dataclass
class RawRecommendation:
    """What the model layer WANTS to do, pre-guard."""
    mode: DeployMode
    overtake_go: bool
    overtake_confidence: float
    requested_deploy_mj: float
    mguk_power_kw: float = 0.0


@dataclass
class GuardedCommand:
    """What actually gets sent to the dashboard, post-guard."""
    mode: DeployMode
    overtake_go: bool
    overtake_confidence: float
    deploy_mj: float
    mguk_power_kw: float
    infringement_flagged: bool
    infringement_reasons: list[str]

    @property
    def guard_intervened(self) -> bool:
        return self.infringement_flagged

    @property
    def guard_reasons(self) -> list[str]:
        return self.infringement_reasons


class ComplianceGuard:
    def __init__(
        self,
        max_deploy_mj: float = MAX_DEPLOY_MJ_PER_LAP,
        max_recovery_mj: float = MAX_RECOVERY_MJ_PER_LAP,
        max_power_kw: float = MAX_MGUK_POWER_KW,
        min_soc_for_deploy: float = MIN_SOC_FOR_DEPLOY,
    ):
        self.max_deploy_mj = max_deploy_mj
        self.max_recovery_mj = max_recovery_mj
        self.max_power_kw = max_power_kw
        self.min_soc_for_deploy = min_soc_for_deploy

    def check(self, rec: RawRecommendation, soc: float) -> GuardedCommand:
        reasons: list[str] = []
        deploy_mj = rec.requested_deploy_mj
        power_kw = rec.mguk_power_kw
        mode = rec.mode
        go = rec.overtake_go

        # 1. Energy deployment ceiling
        if deploy_mj > self.max_deploy_mj:
            reasons.append(
                f"requested deploy {deploy_mj:.2f} MJ > limit {self.max_deploy_mj} MJ"
            )
            deploy_mj = self.max_deploy_mj

        # 2. Recovery ceiling (negative deploy = recovery)
        if deploy_mj < -self.max_recovery_mj:
            reasons.append(
                f"requested recovery {-deploy_mj:.2f} MJ > limit {self.max_recovery_mj} MJ"
            )
            deploy_mj = -self.max_recovery_mj

        # 3. Instantaneous MGU-K power cap
        if power_kw > self.max_power_kw:
            reasons.append(
                f"requested MGU-K power {power_kw:.1f} kW > limit {self.max_power_kw} kW"
            )
            power_kw = self.max_power_kw

        # 4. Physical/legal floor: can't deploy from an empty battery
        if soc <= self.min_soc_for_deploy and deploy_mj > 0:
            reasons.append(f"SOC {soc:.2%} at/below floor, forcing HARVEST")
            deploy_mj = -0.5
            mode = DeployMode.HARVEST
            go = False  # never greenlight an overtake burst with no energy to give it

        # 5. Overtake go/no-go must be internally consistent with mode + SOC
        if go and soc <= self.min_soc_for_deploy:
            reasons.append("overtake go vetoed: insufficient SOC")
            go = False

        return GuardedCommand(
            mode=mode,
            overtake_go=go,
            overtake_confidence=rec.overtake_confidence,
            deploy_mj=deploy_mj,
            mguk_power_kw=power_kw,
            infringement_flagged=len(reasons) > 0,
            infringement_reasons=reasons,
        )

    def safe_default(self) -> GuardedCommand:
        """Fail-safe output when inputs are missing/malformed/stale."""
        return GuardedCommand(
            mode=DeployMode.HARVEST,
            overtake_go=False,
            overtake_confidence=0.0,
            deploy_mj=-0.5,
            mguk_power_kw=0.0,
            infringement_flagged=False,
            infringement_reasons=["fallback: no valid model output"],
        )
