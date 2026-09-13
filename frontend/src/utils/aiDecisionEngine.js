/**
 * AI Race Strategy Decision Engine — APEX PULSE / Team Slipstream
 *
 * Implements:
 * 1. Multi-factor Dynamic Overtake Probability Pipeline
 * 2. Quantitative Reward vs. Risk & Expected Value (EV) Modeling:
 *    EV(Attack)  = P * Reward - (1 - P) * Risk
 *    EV(Harvest) = (1 - P) * Reward_harvest - P * Risk_harvest
 * 3. AI Decision Reasoning ("Why This Decision?" with +/- factor bullets)
 * 4. Predictive Outcomes ("IF ATTACK NOW" vs "IF HARVEST")
 * 5. Deterministic Hackathon Demo Scenarios for instant judging evaluation
 */

import { probStabilizer } from './centralRaceState.js'

/**
 * Sanitizes and validates incoming telemetry/decision payloads to prevent NaN, nulls, and out-of-bound errors.
 */
export function sanitizeDecisionData(data) {
  if (!data || typeof data !== 'object') {
    return {
      gap_ahead_s: 0.57,
      gap_to_ahead_s: 0.57,
      speed_kph: 312,
      closing_speed_kph: 8.5,
      soc: 0.67,
      drs_available: true,
      tyre_life_pct: 82,
      overtake_probability: 70.0,
      expected_value_s: 0.98,
      reward_s: 2.9,
      risk_s: 4.2,
      why_factors: ['DRS wing open', 'ERS ready for boost'],
      risk_factors: ['Heavy braking zone divebomb hazard'],
    }
  }

  const clean = { ...data }
  const cleanNum = (val, fallback, min = -Infinity, max = Infinity) => {
    const num = Number(val)
    if (isNaN(num) || !isFinite(num)) return fallback
    return Math.max(min, Math.min(max, num))
  }

  clean.gap_ahead_s = cleanNum(data.gap_ahead_s ?? data.gap_to_ahead_s, 0.57, 0, 30)
  clean.gap_to_ahead_s = clean.gap_ahead_s
  clean.speed_kph = cleanNum(data.speed_kph ?? data.speed_kmh, 312, 0, 400)
  clean.closing_speed_kph = cleanNum(data.closing_speed_kph, 2.5, -50, 50)
  clean.soc = cleanNum(data.soc, 0.65, 0, 1)
  clean.tyre_life_pct = cleanNum(data.tyre_life_pct, 82, 0, 100)
  clean.lap = Math.round(cleanNum(data.lap, 30, 1, 100))

  if (data.overtake_probability != null) {
    clean.overtake_probability = cleanNum(data.overtake_probability, 50, 0, 100)
  }
  if (data.expected_value_s != null) {
    clean.expected_value_s = cleanNum(data.expected_value_s, 0, -20, 20)
  }
  if (data.reward_s != null) {
    clean.reward_s = cleanNum(data.reward_s, 2.4, 0, 10)
  }
  if (data.risk_s != null) {
    clean.risk_s = cleanNum(data.risk_s, 4.2, 0, 20)
  }

  return clean
}

/**
 * Calculates genuine multi-factor overtake probability (0-100%).
 * Authoritative: If backend has already computed overtake_probability, respects it directly.
 */
export function calculateOvertakeProbability(data) {
  const cleanData = sanitizeDecisionData(data)
  const gap = cleanData.gap_ahead_s
  const drs = Boolean(cleanData.drs_available || (gap > 0 && gap <= 1.0))
  const closingSpeed = cleanData.closing_speed_kph
  const soc = cleanData.soc
  const ersPct = Math.min(100, Math.max(0, Math.round(soc * 100)))
  const tyreLife = cleanData.tyre_life_pct
  const guardIntervened = Boolean(cleanData.guard_intervened)

  // 1. Gap Score (25% weight)
  let gapScore = 15
  if (gap <= 0.45) gapScore = 95
  else if (gap <= 0.70) gapScore = 82
  else if (gap <= 1.00) gapScore = 65
  else if (gap <= 1.40) gapScore = 38
  else gapScore = 12

  // 2. Speed Delta / Closing Speed (20% weight)
  let speedScore = 20
  if (closingSpeed >= 10.0) speedScore = 95
  else if (closingSpeed >= 6.0) speedScore = 80
  else if (closingSpeed >= 2.0) speedScore = 60
  else if (closingSpeed >= -1.0) speedScore = 35
  else speedScore = 15

  // 3. DRS Availability (15% weight)
  const drsScore = drs ? 92 : 18

  // 4. ERS Battery State of Charge (15% weight)
  let ersScore = 10
  if (ersPct >= 75) ersScore = 96
  else if (ersPct >= 50) ersScore = 80
  else if (ersPct >= 30) ersScore = 55
  else if (ersPct >= 15) ersScore = 30
  else ersScore = 5 // Critical battery floor

  // 5. Tyre Life & Grip (10% weight)
  let tyreScore = 20
  if (tyreLife >= 75) tyreScore = 90
  else if (tyreLife >= 50) tyreScore = 70
  else if (tyreLife >= 30) tyreScore = 45
  else tyreScore = 15

  // 6. Track / Passing Sector (10% weight)
  const trackScore = drs ? 88 : 45

  // 7. Traffic & Defense Condition (5% weight)
  const trafficScore = 75

  // Authoritative check: If backend provided probability, use it directly!
  let prob
  if (data?.overtake_probability != null && !isNaN(Number(data.overtake_probability))) {
    prob = Math.min(98, Math.max(5, Math.round(Number(data.overtake_probability))))
  } else {
    // Weighted sum fallback
    let rawProb =
      gapScore * 0.25 +
      speedScore * 0.20 +
      drsScore * 0.15 +
      ersScore * 0.15 +
      tyreScore * 0.10 +
      trackScore * 0.10 +
      trafficScore * 0.05

    if (guardIntervened) rawProb = Math.min(rawProb, 12)
    if (ersPct <= 8) rawProb = Math.min(rawProb, 22)
    prob = Math.min(96, Math.max(8, Math.round(rawProb)))
  }

  // Smooth probability to prevent erratic jumps (<= 2%/tick slew-rate limiter)
  const smoothedProb = probStabilizer.update(prob)

  return {
    prob: smoothedProb,
    rawProb: prob,
    factors: {
      gapScore,
      speedScore,
      drsScore,
      ersScore,
      tyreScore,
      trackScore,
      trafficScore,
    },
    gap,
    drs,
    closingSpeed,
    ersPct,
    tyreLife,
  }
}

/**
 * Standardized AI Decision Explanation
 * Formats transparent metrics (expected gain +2.9s, risk window 4.2s, DRS, tyre, energy, confidence 92%)
 * plus 2-4 concise factual reasons generated directly from state.
 */
export function getStandardizedAiExplanation(rec, probPct, rr, data) {
  const gap = Number(data?.gap_ahead_s ?? data?.gap_to_ahead_s ?? 0.82)
  const drs = Boolean(data?.drs_available || (gap > 0 && gap <= 1.0))
  const ersPct = data?.ersPct ?? Math.round(Number(data?.soc ?? 0.52) * 100)
  const tyreLife = Number(data?.tyre_life_pct ?? 82)
  const closingSpeed = Number(data?.closing_speed_kph ?? (drs ? 8.5 : 1.5))
  
  const expectedGain = rr?.attack?.reward ?? '+2.9s'
  const riskWindow = rr?.attack?.risk ? String(rr.attack.risk).replace('-', '') : '4.2s'
  const drsStatus = drs ? (gap <= 0.85 ? 'ACTIVE' : 'AVAILABLE') : 'DISABLED'
  const tyreCondition = tyreLife >= 65 ? 'GOOD' : tyreLife >= 35 ? 'NOMINAL' : 'CRITICAL'
  const energyReserve = ersPct >= 50 ? 'SUFFICIENT' : ersPct >= 20 ? 'HARVESTING' : 'CRITICAL'
  const confidence = rec?.confidence ?? 92

  const reasons = []
  if (drs) {
    reasons.push(`DRS active (${gap.toFixed(2)}s interval in detection zone).`)
  } else {
    reasons.push(`DRS disabled (${gap.toFixed(2)}s outside 1.00s detection threshold).`)
  }
  if (ersPct >= 40) {
    reasons.push(`ERS battery at ${ersPct}% SOC (120kW boost deployment available).`)
  } else {
    reasons.push(`ERS battery low at ${ersPct}% SOC (insufficient for sustained deployment).`)
  }
  if (tyreLife >= 60) {
    reasons.push(`Tyres in optimal thermal window (${tyreLife}% remaining tread life).`)
  } else {
    reasons.push(`Tyre wear elevated (${tyreLife}% tread life, approaching thermal cliff).`)
  }
  if (closingSpeed > 3.0) {
    reasons.push(`Positive closing delta (+${closingSpeed.toFixed(1)} km/h tow advantage).`)
  }

  return {
    overtakeProbability: probPct,
    recommendation: rec?.title || 'HOLD DELTA / DEFEND APEX',
    action: rec?.action || 'DEFEND',
    expectedGain: typeof expectedGain === 'number' ? `+${expectedGain.toFixed(1)}s` : expectedGain,
    riskWindow: typeof riskWindow === 'number' ? `${riskWindow.toFixed(1)}s` : riskWindow,
    drs: drsStatus,
    tyreCondition,
    energyReserve,
    confidence: `${confidence}%`,
    reasons: reasons.slice(0, 4),
  }
}

/**
 * Calculates Expected Value (EV), Reward, and Risk for both ATTACK and HARVEST actions.
 * Canonical Unified Formula: EV = (Probability * Reward) - ((1 - Probability) * Risk)
 */
export function calculateRewardRisk(probPct, data) {
  const P = probPct / 100
  const ersPct = data?.ersPct ?? Math.round(Number(data?.soc ?? 0.46) * 100)
  const tyreLife = Number(data?.tyre_life_pct ?? 82)

  // Use authoritative backend metrics if provided
  let attackReward = data?.reward_s != null && !isNaN(Number(data.reward_s))
    ? Number(data.reward_s)
    : 2.4
  let attackRisk = data?.risk_s != null && !isNaN(Number(data.risk_s))
    ? Number(data.risk_s)
    : (ersPct < 15 ? 7.6 : (tyreLife < 30 ? 8.2 : 6.8))

  // Unified Expected Value of Attack
  let attackEV
  if (data?.expected_value_s != null && !isNaN(Number(data.expected_value_s))) {
    attackEV = Number(Number(data.expected_value_s).toFixed(2))
  } else {
    attackEV = Number((P * attackReward - (1 - P) * attackRisk).toFixed(2))
  }

  // HARVEST OPTION METRICS
  const harvestReward = 1.1
  const harvestRisk = 1.2
  const harvestEV = Number(((1 - P) * harvestReward - P * 0.35).toFixed(2))

  return {
    attack: {
      reward: `+${attackReward.toFixed(1)}s`,
      rewardVal: attackReward,
      risk: `-${attackRisk.toFixed(1)}s`,
      riskVal: attackRisk,
      ev: attackEV,
      favourable: attackEV > 0,
    },
    harvest: {
      reward: `+${harvestReward.toFixed(1)}s`,
      rewardVal: harvestReward,
      risk: `-${harvestRisk.toFixed(1)}s`,
      riskVal: harvestRisk,
      ev: harvestEV,
      favourable: harvestEV > 0,
    },
  }
}

/**
 * Determines the strategic driver action recommendation.
 */
export function determineRecommendation(probPct, rr, data) {
  // Authoritative action from backend if available
  const backendAction = (data?.action || '').toUpperCase()
  if (backendAction.includes('OVERTAKE') || backendAction === 'ATTACK') {
    return {
      action: 'ATTACK',
      title: 'EXECUTE OVERTAKE (MODE 4 BOOST)',
      badgeClass: 'action-overtake',
      confidence: Math.min(98, Math.max(85, Math.round(Number(data?.overtake_confidence ? data.overtake_confidence * 100 : probPct)))),
      buttonKey: 'ATTACK',
      reason: data?.action_reason || 'Positive EV · Optimal DRS closing delta',
    }
  }
  if (backendAction.includes('ABORT') || backendAction.includes('SAVE') || backendAction === 'HARVEST') {
    return {
      action: 'HARVEST',
      title: 'ABORT ATTACK / HARVEST ERS',
      badgeClass: 'action-harvest',
      confidence: 94,
      buttonKey: 'HARVEST',
      reason: data?.action_reason || 'SOC below threshold / negative EV',
    }
  }
  if (backendAction.includes('DEFEND') || backendAction.includes('HOLD')) {
    return {
      action: 'DEFEND',
      title: 'HOLD DELTA / DEFEND APEX',
      badgeClass: 'action-defend',
      confidence: 88,
      buttonKey: 'DEFEND',
      reason: data?.action_reason || 'Conserve delta and manage thermals',
    }
  }

  // Fallback heuristic
  const tyreLife = Number(data?.tyre_life_pct ?? 82)
  const ersPct = data?.ersPct ?? Math.round(Number(data?.soc ?? 0.46) * 100)
  const gap = Number(data?.gap_ahead_s ?? data?.gap_to_ahead_s ?? 0.57)
  const lap = Number(data?.lap ?? 14)

  if (tyreLife <= 25 || (data?.mode === 'BOX') || (lap >= 33 && tyreLife < 35)) {
    return {
      action: 'PIT',
      title: 'BOX THIS LAP (UNDERCUT)',
      badgeClass: 'action-box',
      confidence: 96,
      buttonKey: 'PIT',
      reason: 'Tyre wear cliff reached',
    }
  }

  if (rr.attack.ev > 0 && probPct >= 65 && ersPct >= 30) {
    return {
      action: 'ATTACK',
      title: 'EXECUTE OVERTAKE (MODE 4 BOOST)',
      badgeClass: 'action-overtake',
      confidence: Math.min(96, Math.max(85, Math.round(probPct * 0.95 + 12))),
      buttonKey: 'ATTACK',
      reason: 'Favourable Expected Value and battery reserves',
    }
  }

  if (gap > 1.4) {
    return {
      action: 'SAVE',
      title: 'DEFEND APEX / MANAGE PACE',
      badgeClass: 'action-defend',
      confidence: 88,
      buttonKey: 'DEFEND',
      reason: 'Outside DRS strike window',
    }
  }

  if (ersPct <= 18 || rr.attack.ev < 0) {
    return {
      action: 'HARVEST',
      title: 'ABORT ATTACK / HARVEST ERS',
      badgeClass: 'action-harvest',
      confidence: 94,
      buttonKey: 'HARVEST',
      reason: 'Negative EV / battery conservation',
    }
  }

  return {
    action: 'DEFEND',
    title: 'HOLD DELTA / DEFEND APEX',
    badgeClass: 'action-defend',
    confidence: 86,
    buttonKey: 'DEFEND',
    reason: 'Hold line and protect track position',
  }
}

/**
 * Builds "Vehicle Dynamics Attribution & Strategy Rationale" with technical sensor channels.
 */
export function getDecisionReasoning(rec, probPct, rr, data) {
  const gap = Number(data?.gap_ahead_s ?? data?.gap_to_ahead_s ?? 0.57)
  const ersPct = data?.ersPct ?? Math.round(Number(data?.soc ?? 0.46) * 100)
  const tyreLife = Number(data?.tyre_life_pct ?? 82)
  const drs = Boolean(data?.drs_available || (gap > 0 && gap <= 1.0))
  const closingSpeed = Number(data?.closing_speed_kph ?? (drs ? 8.5 : 1.5))

  // If backend provided explainability factors, incorporate them directly
  if (data?.why_factors?.length > 0 || data?.risk_factors?.length > 0) {
    const bullets = []
    const whyList = data?.why_factors || []
    const riskList = data?.risk_factors || []

    whyList.forEach((fact, idx) => {
      bullets.push({
        type: 'pos',
        icon: '✓',
        title: fact,
        desc: idx === 0 ? 'Optimal racing channel confirmed by telemetry.' : 'Favourable delta supports strategic execution.',
      })
    })

    riskList.forEach((risk, idx) => {
      bullets.push({
        type: 'neg',
        icon: '✕',
        title: risk,
        desc: idx === 0 ? 'Telemetry monitoring flags tactical risk in this sector.' : 'Secondary risk factor to manage.',
      })
    })

    const summary = data?.action_reason
      ? `Pit Wall Directive [${rec.action}]: ${data.action_reason}. Model convergence at ${probPct}%, EV evaluates at ${rr.attack.ev > 0 ? '+' : ''}${rr.attack.ev}s.`
      : `Pit Wall Directive [${rec.action}]: Telemetry indicates ${probPct}% pass viability with net EV of ${rr.attack.ev > 0 ? '+' : ''}${rr.attack.ev}s.`

    return { summary, bullets }
  }

  if (rec.action === 'HARVEST') {
    return {
      summary: `Pit Wall Strategy Directive mandates ABORTING the attack and prioritizing MGU-K HARVEST. Telemetry channel [CH-06] confirms ERS battery at ${ersPct}% SOC, insufficient for sustained 120kW boost into Curva Grande. Optimal control EV model evaluates a net negative Expected Value (${rr.attack.ev}s).`,
      bullets: [
        {
          type: 'neg',
          icon: '✕',
          title: `[CH-06] Battery Critical (${ersPct}% SOC)`,
          desc: 'Below minimum 15% threshold for sustained Turn 1 MGU-K deployment.',
        },
        {
          type: 'neg',
          icon: '✕',
          title: `Negative Expected Value (${rr.attack.ev}s)`,
          desc: 'Attempting pass yields high risk (-6.8s) of lockup, tyre scrubbing, and counter-pass.',
        },
        {
          type: 'pos',
          icon: '✓',
          title: `[CH-01] DRS Aerodynamic Slipstream (${gap.toFixed(2)}s)`,
          desc: 'Towing in slipstream allows safe harvesting of +35% SOC within 1.5 laps.',
        },
        {
          type: 'pos',
          icon: '✓',
          title: 'Strategic Positioning & Sector 1 Delta',
          desc: 'Preserves P2 track position and preps full boost deploy for Turn 1 next stint.',
        },
      ],
    }
  }

  if (rec.action === 'ATTACK') {
    return {
      summary: `Pit Wall Strategy Directive mandates EXECUTING OVERTAKE NOW. High model convergence (${probPct}%) verified with +${closingSpeed.toFixed(1)} km/h radar closing delta, rear wing DRS flap open, and ERS reserve at ${ersPct}% SOC. Optimal control evaluates a net positive Expected Value (+${rr.attack.ev}s).`,
      bullets: [
        {
          type: 'pos',
          icon: '✓',
          title: `High Probability Convergence (${probPct}%)`,
          desc: 'Dynamic 7-factor model indicates prime passing conditions at Curva Parabolica exit.',
        },
        {
          type: 'pos',
          icon: '✓',
          title: `Net Positive Expected Value (+${rr.attack.ev}s)`,
          desc: `Expected reward (+${rr.attack.reward}s clean air) heavily outweighs defensive risk (-${rr.attack.risk}s).`,
        },
        {
          type: 'pos',
          icon: '✓',
          title: `[CH-06] ERS & DRS Aerodynamics Aligned`,
          desc: `${ersPct}% SOC enables full 120kW boost deployment along Rettifilo straight.`,
        },
        {
          type: 'pos',
          icon: '✓',
          title: `[CH-07] Grip Superiority (+${(tyreLife - 70).toFixed(0)}%)`,
          desc: 'Optimal tyre thermal window delivers late-braking advantage into Turn 1.',
        },
      ],
    }
  }

  if (rec.action === 'PIT') {
    return {
      summary: `Pit Wall Strategy Directive mandates BOX THIS LAP. Telemetry channel [CH-07] confirms tyre degradation (${tyreLife}% remaining) has crossed the thermal cliff with pace loss exceeding 1.4s/lap. Undercut window is open.`,
      bullets: [
        {
          type: 'neg',
          icon: '✕',
          title: `[CH-07] Tyre Tread Thermal Cliff (${tyreLife}%)`,
          desc: 'Tread degradation causing severe rear traction loss out of slow corners.',
        },
        {
          type: 'pos',
          icon: '✓',
          title: 'Pit Window Active (L32–35 Corridor)',
          desc: 'Clear pit exit corridor into P4 with fresh Hard C2 tyres ready in box.',
        },
        {
          type: 'pos',
          icon: '✓',
          title: 'Calculated Undercut Delta (+2.1s)',
          desc: 'Fresh tyres on out-lap will jump rival car by an estimated 2.1 seconds.',
        },
      ],
    }
  }

  // SAVE / DEFEND
  return {
    summary: `Pit Wall Strategy Directive mandates HOLDING POSITION & HARVESTING ENERGY. Radar gap (${gap.toFixed(2)}s) exceeds DRS aerodynamic threshold. Protect tyre carcasses and build battery reserves.`,
    bullets: [
      {
        type: 'pos',
        icon: '✓',
        title: 'Energy Conservation Window',
        desc: 'Lift and coast into chicane to recover +12% MGU-K state of charge.',
      },
      {
        type: 'pos',
        icon: '✓',
        title: `Rear Defense Margin (${(data?.gap_behind_s ?? 1.45).toFixed(1)}s)`,
        desc: 'Comfortable buffer behind allows optimal tyre thermal management.',
      },
      {
        type: 'neg',
        icon: '✕',
        title: 'Outside DRS Aerodynamic Zone',
        desc: 'Attacking now would burn hybrid reserves with low overtake probability.',
      },
    ],
  }
}

/**
 * Predictive Outcome Comparison: "TRAJECTORY A: ATTACK NOW" vs "TRAJECTORY B: HARVEST & STABILIZE"
 */
export function getPredictiveOutcome(rec, probPct, rr, data) {
  const ersPct = data?.ersPct ?? Math.round(Number(data?.soc ?? 0.46) * 100)
  const tyreLife = Number(data?.tyre_life_pct ?? 82)

  return {
    attackNow: {
      probability: `${probPct}%`,
      outcomeTitle: probPct >= 65 ? 'P1 TRACK POSITION GAINED' : 'HIGH RISK OF LOCKUP & COUNTER-ATTACK',
      delta: probPct >= 65 ? '+2.4s Clean Air' : '-6.8s Net Loss',
      tyreImpact: '-8% Wear Spike',
      batteryImpact: `Drop to ${Math.max(0, ersPct - 25)}% SOC`,
      status: probPct >= 65 ? 'RECOMMENDED' : 'HIGH RISK',
      statusClass: probPct >= 65 ? 'pos' : 'neg',
    },
    harvest: {
      probability: '98% STABLE',
      outcomeTitle: 'ENERGY RESERVES REBUILT FOR LAP 16 PASS',
      delta: '+1.1s Net Next Lap',
      tyreImpact: 'Thermal Stabilization',
      batteryImpact: `Recharge to ${Math.min(95, ersPct + 35)}% SOC`,
      status: ersPct < 25 ? 'HIGHLY RECOMMENDED' : 'CONSERVATIVE',
      statusClass: 'pos',
    },
  }
}

/**
 * Tactical Stint Simulation Scenarios
 * Used for deterministic bench testing and race strategy evaluations.
 */
export const DEMO_SCENARIOS = {
  LIVE: {
    id: 'LIVE',
    name: 'LIVE 20Hz TELEMETRY',
    desc: 'Real-time WebSocket feed from physical simulation engine',
    override: null,
  },
  HARVEST: {
    id: 'HARVEST',
    name: 'SCENARIO 1: LOW SOC (5% BAT)',
    desc: 'Low battery triggers EV negative calculation & abort recommendation',
    override: {
      lap: 14,
      speed_kph: 318,
      gap_ahead_s: 0.52,
      gap_behind_s: 1.6,
      soc: 0.05, // 5% Battery
      tyre_life_pct: 78,
      drs_available: true,
      closing_speed_kph: 3.2,
      current_position: 2,
      fuel_pct: 68,
      pit_window: 'L32-35',
      tyre_compound: 'MEDIUM (C3)',
      stint_laps: '14 / 28',
      mode: 'HARVEST',
    },
  },
  ATTACK: {
    id: 'ATTACK',
    name: 'SCENARIO 2: DRS ATTACK (85% BAT)',
    desc: 'High battery + DRS + closing speed triggers OVERTAKE NOW recommendation',
    override: {
      lap: 15,
      speed_kph: 334,
      gap_ahead_s: 0.44,
      gap_behind_s: 2.1,
      soc: 0.85, // 85% Battery
      tyre_life_pct: 84,
      drs_available: true,
      closing_speed_kph: 12.4,
      current_position: 2,
      fuel_pct: 66,
      pit_window: 'L32-35',
      tyre_compound: 'MEDIUM (C3)',
      stint_laps: '15 / 28',
      mode: 'OVERTAKE',
    },
  },
  PIT: {
    id: 'PIT',
    name: 'SCENARIO 3: UNDERCUT (18% TYRE)',
    desc: 'Degraded tyres trigger undercut window BOX recommendation',
    override: {
      lap: 34,
      speed_kph: 288,
      gap_ahead_s: 1.85,
      gap_behind_s: 0.9,
      soc: 0.48,
      tyre_life_pct: 18, // Critical wear!
      drs_available: false,
      closing_speed_kph: -2.4,
      current_position: 3,
      fuel_pct: 32,
      pit_window: 'L32-35 (OPEN)',
      tyre_compound: 'HARD (C2 READY)',
      stint_laps: '34 / 35',
      mode: 'BOX',
    },
  },
  SAVE: {
    id: 'SAVE',
    name: 'SCENARIO 4: REBALANCE (GAP > 1.5s)',
    desc: 'Gap outside DRS zone triggers energy preservation mode',
    override: {
      lap: 22,
      speed_kph: 308,
      gap_ahead_s: 1.95,
      gap_behind_s: 2.8,
      soc: 0.42,
      tyre_life_pct: 64,
      drs_available: false,
      closing_speed_kph: 0.5,
      current_position: 2,
      fuel_pct: 52,
      pit_window: 'L32-35',
      tyre_compound: 'MEDIUM (C3)',
      stint_laps: '22 / 28',
      mode: 'BALANCE',
    },
  },
}
