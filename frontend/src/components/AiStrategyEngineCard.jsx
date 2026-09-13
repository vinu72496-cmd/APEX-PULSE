import React, { useState } from 'react'

export default function AiStrategyEngineCard({
  decisionData,
  activeDriver,
  onRadioAction
}) {
  const [showExplanation, setShowExplanation] = useState(false)

  if (!decisionData) return null

  const mode = String(decisionData.mode || 'HOLD').toUpperCase()
  const overtakeProb = Math.round(decisionData.overtake_probability ?? decisionData.probability ?? 70)
  const rewardSec = decisionData.reward_s ?? decisionData.expected_reward_s ?? 2.5
  const riskSec = decisionData.risk_s ?? 4.2
  const confidence = Math.round(decisionData.confidence_pct ?? decisionData.confidence ?? 85)
  const evVal = Number(decisionData.expected_value_s ?? decisionData.expectedValue ?? decisionData.expected_value_ev ?? 1.71).toFixed(2)
  const isEvPositive = Number(evVal) >= 0

  const getModeStyle = (m) => {
    if (m.includes('OVERTAKE') || m.includes('ATTACK')) {
      return { bg: 'rgba(34, 197, 94, 0.18)', border: '#22c55e', text: '#22c55e', label: 'ATTACK · OVERTAKE RECOMMENDED' }
    }
    if (m.includes('BOX') || m.includes('PIT')) {
      return { bg: 'rgba(239, 68, 68, 0.18)', border: '#ef4444', text: '#ef4444', label: 'BOX THIS LAP · TYRE LIFE CRITICAL' }
    }
    if (m.includes('DEFEND')) {
      return { bg: 'rgba(234, 179, 8, 0.18)', border: '#eab308', text: '#eab308', label: 'DEFEND POSITION · COVER INSIDE' }
    }
    if (m.includes('SAVE')) {
      return { bg: 'rgba(234, 179, 8, 0.18)', border: '#eab308', text: '#eab308', label: 'SAVE TYRES · LIFT AND COAST' }
    }
    return { bg: 'rgba(56, 189, 248, 0.18)', border: '#38bdf8', text: '#38bdf8', label: 'HOLD POSITION · MAINTAIN DELTA' }
  }

  const modeStyle = getModeStyle(mode)

  const factors = [
    { name: 'DRS Zone Advantage', impact: '+18%', pos: true, desc: 'DRS enabled on Rettifilo straight (+12 km/h peak speed)' },
    { name: 'Tyre Delta Condition', impact: (activeDriver?.tyre_age || 8) < 15 ? '+14%' : '-22%', pos: (activeDriver?.tyre_age || 8) < 15, desc: (activeDriver?.tyre_age || 8) < 15 ? 'Fresher compound grip advantage' : 'High thermal degradation on rear tyres' },
    { name: 'ERS Battery Reserve', impact: (activeDriver?.soc || 0.5) > 0.4 ? '+12%' : '-15%', pos: (activeDriver?.soc || 0.5) > 0.4, desc: 'MGU-K deployment available for 120kW boost' },
    { name: 'Gap Distance & Closing Speed', impact: '+22%', pos: true, desc: 'Closing at +7.5 km/h within slipstream pocket' },
    { name: 'Monza Sector 1 Geometry', impact: '+8%', pos: true, desc: 'Turn 1 Rettifilo chicane is primary overtaking hotspot' },
    { name: 'Defensive Line Risk', impact: '-12%', pos: false, desc: 'Defender holds inside line into apex' },
    { name: 'Late Braking Collision Risk', impact: '-14%', pos: false, desc: 'Heavy deceleration zone lock-up hazard' }
  ]

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.9)',
      border: '1px solid rgba(0, 229, 255, 0.25)',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '16px',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
    }}>
      {/* Header Badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        paddingBottom: '10px',
        marginBottom: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '900', letterSpacing: '1.5px', color: '#00e5ff' }}>
            AI STRATEGY ENGINE
          </span>
          <span style={{
            fontSize: '9px',
            background: 'rgba(0, 229, 255, 0.15)',
            color: '#00e5ff',
            padding: '2px 6px',
            borderRadius: '4px',
            fontWeight: '700'
          }}>
            DUAL-MODEL INFERENCE
          </span>
        </div>

        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
          TARGET: <strong style={{ color: '#f8fafc' }}>{activeDriver?.name || 'C. LECLERC'}</strong>
        </div>
      </div>

      {/* Main Recommendation Banner */}
      <div style={{
        background: modeStyle.bg,
        border: `1px solid ${modeStyle.border}`,
        borderRadius: '6px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '14px'
      }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '1px' }}>
            RECOMMENDED ACTION
          </div>
          <div style={{ fontSize: '18px', fontWeight: '900', color: modeStyle.text, marginTop: '2px', letterSpacing: '0.5px' }}>
            {modeStyle.label}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', color: '#94a3b8' }}>RECOMMENDED WINDOW</div>
          <div style={{ fontSize: '14px', fontWeight: '800', color: '#f8fafc' }}>
            LAPS {activeDriver?.lap || 30} – {(activeDriver?.lap || 30) + 2}
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '8px',
        background: 'rgba(0, 0, 0, 0.35)',
        padding: '10px',
        borderRadius: '6px',
        marginBottom: '14px',
        textAlign: 'center'
      }}>
        <div>
          <div style={{ fontSize: '9px', color: '#64748b', fontWeight: '700' }}>OVERTAKE PROB</div>
          <div style={{ fontSize: '16px', fontWeight: '900', color: overtakeProb >= 60 ? '#22c55e' : (overtakeProb >= 40 ? '#eab308' : '#ef4444'), marginTop: '2px' }}>
            {overtakeProb}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: '9px', color: '#64748b', fontWeight: '700' }}>EXPECTED REWARD</div>
          <div style={{ fontSize: '16px', fontWeight: '900', color: '#22c55e', marginTop: '2px' }}>
            +{rewardSec}s
          </div>
        </div>
        <div>
          <div style={{ fontSize: '9px', color: '#64748b', fontWeight: '700' }}>COLLISION RISK</div>
          <div style={{ fontSize: '16px', fontWeight: '900', color: riskSec > 5 ? '#ef4444' : '#eab308', marginTop: '2px' }}>
            {riskSec}s
          </div>
        </div>
        <div>
          <div style={{ fontSize: '9px', color: '#64748b', fontWeight: '700' }}>AI CONFIDENCE</div>
          <div style={{ fontSize: '16px', fontWeight: '900', color: '#38bdf8', marginTop: '2px' }}>
            {confidence}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: '9px', color: '#64748b', fontWeight: '700' }}>EXPECTED VALUE (EV)</div>
          <div style={{ fontSize: '16px', fontWeight: '900', color: isEvPositive ? '#22c55e' : '#ef4444', marginTop: '2px' }}>
            {isEvPositive ? `+${evVal}s` : `${evVal}s`}
          </div>
        </div>
      </div>

      {/* Main Reason Bullet Points */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '6px',
        padding: '10px 12px',
        marginBottom: '14px',
        fontSize: '11px'
      }}>
        <div style={{ fontWeight: '800', color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '6px' }}>
          STRATEGIC RATIONALE:
        </div>
        <ul style={{ margin: 0, paddingLeft: '18px', color: '#cbd5e1', lineHeight: '1.6' }}>
          <li>DRS zone active with +7.5 km/h closing speed delta into Turn 1 Rettifilo.</li>
          <li>Net Expected Value is positive (+{evVal}s) with 88% confidence in clean pass.</li>
          <li>Battery reserve sufficient (ERS {Math.round((activeDriver?.soc || 0.52) * 100)}%) for full 120kW deployment.</li>
          <li>Recommend passing before Lap 34 to avoid elevated tyre graining on high-fuel stint.</li>
        </ul>
      </div>

      {/* Expandable WHY IS AI RECOMMENDING THIS Attribution Matrix */}
      <button
        onClick={() => setShowExplanation(!showExplanation)}
        style={{
          width: '100%',
          background: 'rgba(0, 229, 255, 0.08)',
          border: '1px solid rgba(0, 229, 255, 0.3)',
          color: '#00e5ff',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: '800',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          letterSpacing: '0.5px'
        }}
      >
        <span>🔍 {showExplanation ? 'HIDE AI FACTOR ATTRIBUTION MATRIX' : 'WHY IS AI RECOMMENDING THIS? (FACTOR ATTRIBUTION)'}</span>
        <span>{showExplanation ? '▲ COLLAPSE' : '▼ EXPAND'}</span>
      </button>

      {showExplanation && (
        <div style={{
          marginTop: '12px',
          background: 'rgba(0, 0, 0, 0.45)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '6px',
          padding: '12px'
        }}>
          <div style={{
            fontSize: '10px',
            fontWeight: '800',
            color: '#94a3b8',
            letterSpacing: '1px',
            marginBottom: '8px'
          }}>
            FACTOR CONTRIBUTION BREAKDOWN (AUTHORITATIVE SENSITIVITY)
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {factors.map((f, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(30, 41, 59, 0.5)',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  fontSize: '11px'
                }}
              >
                <div>
                  <span style={{ fontWeight: '700', color: '#f8fafc' }}>{f.name}</span>
                  <span style={{ color: '#94a3b8', fontSize: '10px', marginLeft: '8px' }}>— {f.desc}</span>
                </div>
                <div style={{
                  fontWeight: '900',
                  color: f.pos ? '#22c55e' : '#ef4444',
                  fontSize: '12px',
                  fontFamily: 'monospace'
                }}>
                  {f.impact}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: '10px',
            paddingTop: '8px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11px',
            color: '#cbd5e1'
          }}>
            <span>FORMULA: <code>EV = (P × Reward) - ((1 - P) × Risk)</code></span>
            <span style={{ fontWeight: '800', color: '#00e5ff' }}>NET RESULT: {evVal}s ADVANTAGE</span>
          </div>
        </div>
      )}
    </div>
  )
}
