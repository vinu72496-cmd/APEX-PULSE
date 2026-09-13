import React, { useState, useEffect, useRef, useMemo } from 'react'
import ProbabilitySparkline from './ProbabilitySparkline.jsx'
import {
  calculateOvertakeProbability,
  calculateRewardRisk,
  determineRecommendation,
  getDecisionReasoning,
  getPredictiveOutcome,
} from '../utils/aiDecisionEngine.js'

/**
 * AiOvertakeCenter — Center Hero Column: AI Race Strategist & Decision Engine
 *
 * Implements:
 * 1. AI Recommendation Badge: HARVEST / ABORT ATTACK vs ATTACK (OVERTAKE NOW) vs DEFEND vs PIT
 * 2. Overtake Probability: Dynamic multi-factor (Gap, Speed, DRS, Battery, Tyre, Track, Traffic)
 *    Smooth rate-limited transitions without random jumps
 * 3. Quantitative Reward vs Risk Comparison:
 *    - Attack: Expected Reward (+2.4s), Failure Risk (-6.8s), EV (+1.45 / -0.91)
 *    - Harvest: Expected Reward (+1.1s), Deficit Risk (-1.2s), EV (+0.78)
 * 4. AI Confidence (e.g. 94% HIGH)
 * 5. "Why This Decision?": Dynamic bullet points with [✓] and [✕]
 * 6. Predictive Outcome: Side-by-side comparison ("IF ATTACK NOW" vs "IF HARVEST")
 * 7. Transparent Factor Attribution Breakdown with weights
 * 8. Real-time 30-second probability trace
 */
export default function AiOvertakeCenter({ decision }) {
  // 1. Raw multi-factor model calculation
  const rawModel = useMemo(() => {
    return calculateOvertakeProbability(decision)
  }, [decision])

  // 2. Smooth rate-limited probability stepping (capped at 1-2% per tick)
  const [displayedProb, setDisplayedProb] = useState(rawModel.prob)
  const [probHistory, setProbHistory] = useState([
    { prob: rawModel.prob, event: null },
    { prob: rawModel.prob, event: null },
  ])
  const [deltaChange, setDeltaChange] = useState({ text: 'STEADY DELTA', dir: 'flat' })
  const lastProbRef = useRef(rawModel.prob)
  const targetRef = useRef(rawModel.prob)
  targetRef.current = rawModel.prob

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayedProb((prev) => {
        const diff = targetRef.current - prev
        if (Math.abs(diff) < 1) return prev

        // Step by at most 1-2 points unless large preset scenario jump
        const step = Math.abs(diff) > 20
          ? Math.sign(diff) * Math.round(Math.abs(diff) * 0.45)
          : Math.sign(diff) * Math.min(2, Math.max(1, Math.round(Math.abs(diff) * 0.35)))

        const nextVal = Math.min(98, Math.max(5, prev + step))

        if (Math.abs(nextVal - lastProbRef.current) >= 3) {
          const change = nextVal - lastProbRef.current
          const isUp = change > 0
          setDeltaChange({
            text: `${isUp ? '↑ +' : '↓ '}${change}% ${rawModel.drs ? 'DRS DETECTED' : 'DELTA SHIFT'}`,
            dir: isUp ? 'up' : 'down',
          })
          lastProbRef.current = nextVal
        }

        return nextVal
      })
    }, 250)

    return () => clearInterval(interval)
  }, [rawModel.drs])

  // Record history buffer for line chart
  useEffect(() => {
    const histTimer = setInterval(() => {
      setProbHistory((prev) => {
        let evt = null
        if (rawModel.drs && (!prev[prev.length - 1] || prev[prev.length - 1].prob < displayedProb)) {
          evt = 'DRS'
        }
        return [...prev.slice(-40), { prob: displayedProb, event: evt }]
      })
    }, 600)

    return () => clearInterval(histTimer)
  }, [displayedProb, rawModel.drs])

  // 3. Computed Strategy Metrics based on smoothed displayed probability
  const rewardRisk = useMemo(() => {
    return calculateRewardRisk(displayedProb, { ...decision, ersPct: rawModel.ersPct })
  }, [displayedProb, decision, rawModel.ersPct])

  const recommendation = useMemo(() => {
    return determineRecommendation(displayedProb, rewardRisk, { ...decision, ersPct: rawModel.ersPct })
  }, [displayedProb, rewardRisk, decision, rawModel.ersPct])

  const reasoning = useMemo(() => {
    return getDecisionReasoning(recommendation, displayedProb, rewardRisk, { ...decision, ersPct: rawModel.ersPct })
  }, [recommendation, displayedProb, rewardRisk, decision, rawModel.ersPct])

  const predictive = useMemo(() => {
    return getPredictiveOutcome(recommendation, displayedProb, rewardRisk, { ...decision, ersPct: rawModel.ersPct })
  }, [recommendation, displayedProb, rewardRisk, decision, rawModel.ersPct])

  // Attribution factor list
  const factorList = [
    { name: 'GAP TO CAR', val: `${rawModel.gap.toFixed(2)}s`, weight: '25%', score: rawModel.factors.gapScore, good: rawModel.factors.gapScore >= 60 },
    { name: 'SPEED DELTA', val: `+${rawModel.closingSpeed.toFixed(1)} km/h`, weight: '20%', score: rawModel.factors.speedScore, good: rawModel.factors.speedScore >= 60 },
    { name: 'DRS STATUS', val: rawModel.drs ? 'ACTIVE' : 'OFF', weight: '15%', score: rawModel.factors.drsScore, good: rawModel.drs },
    { name: 'ERS BATTERY', val: `${rawModel.ersPct}%`, weight: '15%', score: rawModel.factors.ersScore, good: rawModel.ersPct >= 30 },
    { name: 'TYRE LIFE', val: `${rawModel.tyreLife}%`, weight: '10%', score: rawModel.factors.tyreScore, good: rawModel.tyreLife >= 50 },
    { name: 'PASSING SECTOR', val: rawModel.drs ? 'RETTIFILO' : 'CHICANE', weight: '10%', score: rawModel.factors.trackScore, good: rawModel.drs },
    { name: 'TRAFFIC COND.', val: 'CLEAR AIR', weight: '5%', score: rawModel.factors.trafficScore, good: true },
  ]

  return (
    <div className="ai-overtake-hero-card">
      {/* Top Bar: Title & Model Convergence */}
      <div className="ot-hero-header">
        <div className="ot-hero-title-wrap">
          <span className="ot-badge-dot" />
          <span className="ot-hero-title">PIT WALL STRATEGY DIRECTIVE · OVERTAKE CONTROL SYSTEM</span>
        </div>

        <div className="ai-confidence-pill">
          <span className="conf-label">MODEL CONVERGENCE:</span>
          <span className="conf-value">{recommendation.confidence}% · HIGH CERTAINTY</span>
        </div>
      </div>

      {/* Main Overtake Probability & Action Hero Row */}
      <div className="ot-main-hero-body">
        {/* Left: Overtake Probability Gauge */}
        <div className="ot-gauge-column">
          <div className="ot-prob-sub-label">DYNAMIC OVERTAKE PROBABILITY</div>
          <div className="ot-prob-giant-number">
            {displayedProb}<span className="pct-sign">%</span>
          </div>
          <div className="ot-confidence-badge">
            <span className={`conf-indicator-dot ${displayedProb >= 65 ? 'good' : displayedProb >= 35 ? 'warn' : 'crit'}`} />
            <span>{displayedProb >= 65 ? 'PRIME ATTACK WINDOW' : displayedProb >= 35 ? 'MARGINAL DELTA WINDOW' : 'ATTACK ABORTED'}</span>
          </div>
          <div className={`ot-what-changed ${deltaChange.dir}`}>
            {deltaChange.text}
          </div>
        </div>

        {/* Right: Recommended Action Hero Badge */}
        <div className="ot-action-column">
          <div className="ot-action-sub-label">ENGINEERING DIRECTIVE / STRATEGY CALL</div>
          <div className={`ot-action-giant-badge ${recommendation.badgeClass}`}>
            {recommendation.title}
          </div>
          <div className="ot-action-helper">
            {recommendation.action === 'ATTACK'
              ? 'DEPLOY 120kW MGU-K BOOST · DIVE RETTIFILO INSIDE LINE'
              : recommendation.action === 'HARVEST'
              ? 'LIFT & COAST TOWING IN SLIPSTREAM · RECHARGE TO 45% SOC'
              : recommendation.action === 'PIT'
              ? 'BOX BOX BOX THIS LAP · PIT EXIT INTO CLEAR AIR'
              : 'DEFEND APEX · MANAGE REAR TYRE THERMAL DEGRADATION'}
          </div>
        </div>
      </div>

      {/* QUANTITATIVE REWARD VS RISK & EXPECTED VALUE (EV) COMPARISON */}
      <div className="ev-comparison-panel">
        <div className="ev-panel-header">
          <span className="ev-hdr-title">QUANTITATIVE REWARD VS. RISK · OPTIMAL CONTROL EXPECTED VALUE (EV) MODEL</span>
          <span className="ev-hdr-formula">EV = (P × REWARD) − ((1 − P) × RISK)</span>
        </div>

        <div className="ev-cards-grid">
          {/* Action A: ATTACK NOW */}
          <div className={`ev-action-card ${rewardRisk.attack.favourable ? 'favourable' : 'unfavourable'}`}>
            <div className="ev-card-top">
              <span className="ev-card-tag">STRATEGY OPTION A: IMMEDIATE ATTACK</span>
              <span className={`ev-badge ${rewardRisk.attack.favourable ? 'pos' : 'neg'}`}>
                {rewardRisk.attack.favourable ? 'FAVOURABLE' : 'UNFAVOURABLE'}
              </span>
            </div>
            <div className="ev-metrics-row">
              <div className="ev-metric">
                <span className="m-lbl">EXP. REWARD</span>
                <span className="m-val pos">{rewardRisk.attack.reward}s</span>
                <span className="m-sub">Clean Air Pace Delta</span>
              </div>
              <div className="ev-metric">
                <span className="m-lbl">FAIL RISK</span>
                <span className="m-val neg">{rewardRisk.attack.risk}s</span>
                <span className="m-sub">Lockup & Counter</span>
              </div>
              <div className="ev-metric highlight">
                <span className="m-lbl">EXPECTED VALUE</span>
                <span className={`m-val ev-val ${rewardRisk.attack.ev >= 0 ? 'pos' : 'neg'}`}>
                  {rewardRisk.attack.ev >= 0 ? `+${rewardRisk.attack.ev}` : rewardRisk.attack.ev}
                </span>
                <span className="m-sub">{rewardRisk.attack.ev >= 0 ? 'Net Positive (+)' : 'Negative EV (Abort)'}</span>
              </div>
            </div>
          </div>

          {/* Action B: HARVEST / PREPARE */}
          <div className={`ev-action-card ${rewardRisk.harvest.favourable ? 'favourable' : 'neutral'}`}>
            <div className="ev-card-top">
              <span className="ev-card-tag">STRATEGY OPTION B: HARVEST & STABILIZE</span>
              <span className="ev-badge neutral">
                HIGH CERTAINTY
              </span>
            </div>
            <div className="ev-metrics-row">
              <div className="ev-metric">
                <span className="m-lbl">EXP. REWARD</span>
                <span className="m-val pos">{rewardRisk.harvest.reward}s</span>
                <span className="m-sub">Rebuild +35% SOC</span>
              </div>
              <div className="ev-metric">
                <span className="m-lbl">GAP DEFICIT</span>
                <span className="m-val neg">{rewardRisk.harvest.risk}s</span>
                <span className="m-sub">Rival Pulls Ahead</span>
              </div>
              <div className="ev-metric highlight">
                <span className="m-lbl">EXPECTED VALUE</span>
                <span className="m-val ev-val pos">
                  +{rewardRisk.harvest.ev}
                </span>
                <span className="m-sub">Safe Energy Build</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* VEHICLE DYNAMICS ATTRIBUTION & STRATEGY RATIONALE */}
      <div className="ot-explanation-box">
        <div className="explanation-head">
          <div className="exp-left">
            <span className="exp-badge">SECU</span>
            <span className="exp-title">VEHICLE DYNAMICS ATTRIBUTION & STRATEGY RATIONALE</span>
          </div>
          <span className="exp-model-tag">OPTIMAL CONTROL EXPECTED VALUE (EV) MODEL</span>
        </div>
        <p className="explanation-summary">{reasoning.summary}</p>
        
        <div className="reasoning-bullets-grid">
          {reasoning.bullets.map((b, i) => (
            <div key={i} className={`reasoning-bullet-item ${b.type}`}>
              <span className={`bullet-icon ${b.type}`}>{b.icon}</span>
              <div className="bullet-content">
                <div className="bullet-title">{b.title}</div>
                <div className="bullet-desc">{b.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* STINT PACE FORECAST & ENERGY DELTA */}
      <div className="predictive-outcome-box">
        <div className="predictive-header">
          <span className="pred-title">STINT PACE FORECAST & ENERGY DELTA</span>
          <span className="pred-sub">DUAL-STINT DELTA SIMULATION</span>
        </div>

        <div className="predictive-grid">
          {/* Outcome If Attack Now */}
          <div className={`pred-column ${predictive.attackNow.statusClass}`}>
            <div className="pred-col-header">
              <span className="pred-tag">TRAJECTORY A: ATTACK NOW</span>
              <span className={`pred-status-chip ${predictive.attackNow.statusClass}`}>
                {predictive.attackNow.status}
              </span>
            </div>
            <div className="pred-hero-outcome">{predictive.attackNow.outcomeTitle}</div>
            <div className="pred-specs-list">
              <div className="pred-spec"><span className="spec-k">Projected Delta:</span> <span className="spec-v">{predictive.attackNow.delta}</span></div>
              <div className="pred-spec"><span className="spec-k">Tyre Degradation:</span> <span className="spec-v">{predictive.attackNow.tyreImpact}</span></div>
              <div className="pred-spec"><span className="spec-k">Battery Post-Move:</span> <span className="spec-v">{predictive.attackNow.batteryImpact}</span></div>
            </div>
          </div>

          {/* Outcome If Harvest */}
          <div className="pred-column pos">
            <div className="pred-col-header">
              <span className="pred-tag">TRAJECTORY B: HARVEST & STABILIZE</span>
              <span className="pred-status-chip pos">
                OPTIMAL TRAJECTORY
              </span>
            </div>
            <div className="pred-hero-outcome">{predictive.harvest.outcomeTitle}</div>
            <div className="pred-specs-list">
              <div className="pred-spec"><span className="spec-k">Projected Delta:</span> <span className="spec-v">{predictive.harvest.delta}</span></div>
              <div className="pred-spec"><span className="spec-k">Tyre Degradation:</span> <span className="spec-v">{predictive.harvest.tyreImpact}</span></div>
              <div className="pred-spec"><span className="spec-k">Battery Post-Move:</span> <span className="spec-v">{predictive.harvest.batteryImpact}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* TRANSPARENT FACTOR ATTRIBUTION MATRIX */}
      <div className="ot-transparent-matrix">
        <div className="matrix-head">
          <span className="matrix-title">7-FACTOR TELEMETRY ATTRIBUTION MATRIX</span>
          <span className="matrix-sub">SECU CAN-BUS WEIGHTS</span>
        </div>

        <div className="matrix-grid">
          {factorList.map((f, i) => (
            <div key={i} className={`matrix-chip ${f.good ? 'pos' : 'neg'}`}>
              <div className="chip-header">
                <span className="chip-name">{f.name}</span>
                <span className="chip-weight">({f.weight})</span>
              </div>
              <div className="chip-center">
                <span className="chip-val">{f.val}</span>
                <span className={`chip-delta ${f.good ? 'pos' : 'neg'}`}>
                  {f.score}/100
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Real-Time Smoothed Probability Graph */}
      <ProbabilitySparkline
        history={probHistory}
        currentValue={displayedProb}
        height={48}
      />
    </div>
  )
}
