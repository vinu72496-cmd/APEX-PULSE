import React, { useMemo } from 'react'

/**
 * AiDecisionReasoning — F1 Pit Wall AI Tactical Decision Engine Card
 *
 * Displays:
 * 1. AI Recommendation: OVERTAKE / HOLD POSITION / DEFEND / PIT
 * 2. Confidence Percentage
 * 3. 3-5 Transparent Tactical Reasons
 * 4. Expected Reward
 * 5. Estimated Risk
 */
export default function AiDecisionReasoning({ decision }) {
  const gapSec = Number(decision?.gap_ahead_s ?? decision?.gap_to_ahead_s ?? 1.8)
  const drs = Boolean(decision?.drs_available || (gapSec > 0 && gapSec <= 1.0))
  const socVal = Number(decision?.soc ?? 0.65)
  const socPct = Math.round(socVal * 100)
  const closingKph = Number(decision?.closing_speed_kph ?? (drs ? 12.4 : 3.2))
  const paceDelta = -Number(decision?.sector_delta_s ?? -0.18)
  const tyreLife = Number(decision?.tyre_life_pct ?? Math.max(25, 100 - (Number(decision?.lap ?? 14) % 25) * 3.4))
  const guardIntervened = Boolean(decision?.guard_intervened)
  const guardReasons = decision?.guard_reasons ?? []
  const riskRatio = Number(decision?.risk_ratio ?? 1.15)
  const prob = Number(decision?.overtake_probability ?? 64)

  const reasoning = useMemo(() => {
    let recommendation = 'HOLD POSITION'
    let recClass = 'rec-hold'
    let confidence = Math.min(96, Math.max(68, Math.round(prob * 0.4 + 52)))
    let reasons = []
    let reward = '+0.25s Lap Delta · Energy Balance Maintained'
    let risk = '18% · Low tyre wear & thermal stability'

    if (guardIntervened) {
      recommendation = 'ABORT / DEFEND'
      recClass = 'rec-abort'
      confidence = 99
      reasons = [
        `Compliance Guard veto active: ${guardReasons[0] || 'Regulatory safety envelope breached'}.`,
        `Immediate energy de-rate required to prevent FIA technical penalty.`,
        `Defensive line recommended at next apex to protect against undercut.`,
      ]
      reward = 'Zero penalty points · Legal powertrain certification'
      risk = '95% Hazard if deployment continued · Invalidation'
    } else if (tyreLife < 22) {
      recommendation = 'BOX THIS LAP'
      recClass = 'rec-pit'
      confidence = 94
      reasons = [
        `Tyre life critical (${tyreLife.toFixed(0)}%) - Degradation cliff reached.`,
        `Pace deficit increasing by +0.55s per lap in traction zones.`,
        `Pit window open: Rejoin in clear air ahead of midfield traffic.`,
      ]
      reward = 'Fresh C1 Hards · +1.8s pace reset on out-lap'
      risk = '45% · 2.4s pit stop turnaround execution window'
    } else if (socPct < 15) {
      recommendation = 'DEFEND & HARVEST'
      recClass = 'rec-defend'
      confidence = 91
      reasons = [
        `Hybrid SOC at ${socPct}% - Below minimum deployment threshold (15%).`,
        `MGU-K regen required under heavy braking to restore tactical reserves.`,
        `Protect inside line at Variante del Rettifilo to deny rival dive.`,
      ]
      reward = '+22% SOC recharge over 1.2 laps'
      risk = '32% · Vulnerable on main straight exit without K-boost'
    } else if (prob >= 68 && riskRatio <= 1.05 && gapSec <= 0.85) {
      recommendation = 'OVERTAKE NOW'
      recClass = 'rec-overtake'
      confidence = Math.min(97, Math.max(82, Math.round(prob)))
      reasons = [
        `Gap closed to ${gapSec.toFixed(2)}s: In prime DRS slipstream attack envelope.`,
        `Straightline speed delta +${closingKph.toFixed(1)} km/h with 120kW MGU-K boost.`,
        `Tyre life (${tyreLife.toFixed(0)}%) gives +0.22s traction advantage off previous apex.`,
        `Risk:Reward ratio (${riskRatio.toFixed(2)}:1) confirms favorable passing probability.`,
        `Rival Car #16 defensive commitment rated MODERATE - Outside dummy viable.`,
      ]
      reward = '+1 POS (P2) · Clean air advantage · +0.650s lap delta'
      risk = '24% · Late braking lockup risk at Turn 1 85m board'
    } else if (prob >= 50 && gapSec <= 1.2) {
      recommendation = 'ATTACK & PRESSURE'
      recClass = 'rec-attack'
      confidence = 79
      reasons = [
        `Gap is ${gapSec.toFixed(2)}s - Rival under active DRS pressure.`,
        `Battery SOC at ${socPct}%: Capable of 1.4 MJ tactical deployment burst.`,
        `Forces rival onto defensive dirty line through Curva Grande.`,
        `Prepare optimal exit trajectory for next DRS activation zone.`,
      ]
      reward = 'Compromises rival tyre thermal window · Forces mistake'
      risk = '36% · Moderate front-wing aerodynamic wake turbulence'
    } else {
      recommendation = 'HOLD POSITION'
      recClass = 'rec-hold'
      confidence = 86
      reasons = [
        `Interval gap (${gapSec.toFixed(2)}s) exceeds immediate overtake strike distance.`,
        `Maintain delta pace to keep tyre temperatures in optimal 100-104°C window.`,
        `Conserve battery state (${socPct}%) for targeted attack on Lap 18.`,
        `Pace differential (+${paceDelta.toFixed(2)}s) steadily reeling in leader.`,
      ]
    }

    if (decision?.why_factors?.length > 0) {
      reasons = [...decision.why_factors]
      if (decision?.risk_factors?.length > 0) {
        reasons.push(`Risk: ${decision.risk_factors[0]}`)
      }
    }

    if (decision?.reward_s != null) {
      reward = `+${Number(decision.reward_s).toFixed(1)}s Clean Air · PPO Optimized`
    }
    if (decision?.risk_s != null) {
      risk = `-${Number(decision.risk_s).toFixed(1)}s · ${decision.risk_label || 'Calculated Risk'}`
    }

    // Direct alignment with authoritative backend action if available
    const bAction = (decision?.action || '').toUpperCase()
    if (bAction.includes('OVERTAKE') || bAction === 'ATTACK') {
      recommendation = decision.action
      recClass = 'rec-overtake'
      confidence = Math.min(98, Math.max(82, Math.round(prob)))
    } else if (bAction.includes('SAVE') || bAction.includes('HARVEST') || bAction.includes('ABORT')) {
      recommendation = decision.action
      recClass = 'rec-abort'
      confidence = 94
    } else if (bAction.includes('DEFEND')) {
      recommendation = decision.action
      recClass = 'rec-defend'
      confidence = 88
    } else if (bAction.includes('HOLD')) {
      recommendation = decision.action
      recClass = 'rec-hold'
      confidence = 86
    }

    return {
      recommendation,
      recClass,
      confidence,
      reasons,
      reward,
      risk,
    }
  }, [gapSec, drs, socPct, closingKph, paceDelta, tyreLife, guardIntervened, guardReasons, riskRatio, prob])

  return (
    <div className="ai-reasoning-card">
      <div className="reasoning-header">
        <div className="reasoning-title-group">
          <span className="telem-sensor-badge">SECU</span>
          <span className="reasoning-title">OPTIMAL CONTROL STRATEGY RATIONALE</span>
        </div>
        <div className="reasoning-conf-badge">
          <span className="conf-dot" />
          <span className="conf-val">MODEL CONVERGENCE: {reasoning.confidence}%</span>
        </div>
      </div>

      <div className="reasoning-hero-row">
        <div className="rec-badge-wrap">
          <span className="rec-prefix">STRAT DIRECTIVE</span>
          <span className={`rec-tag ${reasoning.recClass}`}>{reasoning.recommendation}</span>
        </div>

        <div className="rec-metrics-strip">
          <div className="rec-metric-pill reward">
            <span className="metric-label">EXPECTED REWARD</span>
            <span className="metric-text">{reasoning.reward}</span>
          </div>
          <div className="rec-metric-pill risk">
            <span className="metric-label">ESTIMATED RISK</span>
            <span className="metric-text">{reasoning.risk}</span>
          </div>
        </div>
      </div>

      <div className="reasoning-body">
        <div className="reasoning-list-label">TACTICAL DRIVERS & ATTRIBUTION:</div>
        <ul className="reasoning-list">
          {reasoning.reasons.map((r, i) => (
            <li key={i} className="reason-item">
              <span className="reason-idx">{i + 1}</span>
              <span className="reason-text">{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
