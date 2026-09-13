import React from 'react'

/**
 * StrategyTimeline — Compact F1 Pit Wall Strategy Stint Timeline
 *
 * Visualizes:
 * NOW → OVERTAKE → HOLD → PIT → ATTACK
 * with lap numbers, compound badges, and active state indicators.
 */
export default function StrategyTimeline({ decision }) {
  const currentLap = Number(decision?.lap ?? 14)

  const steps = [
    {
      id: 'now',
      phase: 'NOW',
      laps: `LAP ${currentLap}`,
      action: 'PUSH DELTA',
      compound: 'SOFT',
      compoundColor: '#FF1744',
      active: currentLap <= 15,
      completed: false,
    },
    {
      id: 'overtake',
      phase: 'OVERTAKE',
      laps: 'LAP 16',
      action: 'DEPLOY MGU-K',
      compound: 'SOFT',
      compoundColor: '#FF1744',
      active: currentLap === 16,
      completed: currentLap > 16,
    },
    {
      id: 'hold',
      phase: 'HOLD',
      laps: 'LAPS 17-21',
      action: 'CONSERVE TYRES',
      compound: 'SOFT',
      compoundColor: '#FF1744',
      active: currentLap >= 17 && currentLap <= 21,
      completed: currentLap > 21,
    },
    {
      id: 'pit',
      phase: 'PIT',
      laps: 'LAP 22',
      action: 'BOX FOR HARDS',
      compound: 'HARD',
      compoundColor: '#FFFFFF',
      active: currentLap === 22,
      completed: currentLap > 22,
    },
    {
      id: 'attack',
      phase: 'ATTACK',
      laps: 'LAPS 23-50',
      action: 'PODIUM CHARGE',
      compound: 'HARD',
      compoundColor: '#FFFFFF',
      active: currentLap >= 23,
      completed: false,
    },
  ]

  return (
    <div className="strategy-timeline-card">
      <div className="timeline-header">
        <div className="timeline-title-wrap">
          <span className="timeline-icon">⏱️</span>
          <span className="timeline-title">COMPACT STRATEGY TIMELINE</span>
        </div>
        <div className="timeline-stint-badge">STINT 1/2 · 1-STOP STRATEGY (SOFT &rarr; HARD)</div>
      </div>

      <div className="timeline-track">
        {steps.map((step, idx) => (
          <React.Fragment key={step.id}>
            <div className={`timeline-node ${step.active ? 'active' : ''} ${step.completed ? 'completed' : ''}`}>
              <div className="node-top">
                <span className="node-phase">{step.phase}</span>
                {step.active && <span className="active-pip" />}
              </div>
              <div className="node-laps">{step.laps}</div>
              <div className="node-action">{step.action}</div>
              <div className="node-tyre">
                <span
                  className="tyre-dot"
                  style={{ backgroundColor: step.compoundColor, boxShadow: `0 0 6px ${step.compoundColor}80` }}
                />
                <span className="tyre-name" style={{ color: step.compoundColor }}>{step.compound}</span>
              </div>
            </div>

            {idx < steps.length - 1 && (
              <div className={`timeline-connector ${step.completed ? 'completed' : ''}`}>
                <span className="connector-line" />
                <span className="connector-arrow">▶</span>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
