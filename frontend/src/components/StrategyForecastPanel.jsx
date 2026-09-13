import React, { useMemo } from 'react'
import LiveTrackMap from './LiveTrackMap.jsx'
import { centralRaceState } from '../utils/centralRaceState.js'

/**
 * StrategyForecastPanel — Right Column: Live Track Map, Strategy Data & Forecast
 *
 * Implements:
 * 1. Compact Live Monza Track Map with animated cars
 * 2. Standardized Pit Strategy Card:
 *    - PIT WINDOW: LAP 34–36
 *    - RECOMMENDED: MEDIUM → HARD
 *    - EXPECTED GAIN: +1.8s
 *    - CONFIDENCE: 87%
 * 3. Race Position Forecast: Synchronized with active driver position & target
 * 4. Tactical Risk Meter: Collision, Strategic, Tyre, Battery risk breakdown
 * 5. Race Engineer Alerts: Contextual real-time radio/pit-wall alerts
 */
export default function StrategyForecastPanel({ decision }) {
  const activeDriver = centralRaceState.getActiveDriver()

  const lap = Number(decision?.lap ?? activeDriver?.lap ?? 30)
  const currentPos = activeDriver?.posNum ?? Number(decision?.current_position ?? 4)
  const nextPos = Math.max(1, currentPos - 1)
  const prevPos = Math.min(10, currentPos + 1)
  const driverCode = activeDriver?.code ?? 'LEC'
  const driverName = activeDriver?.name ?? 'C. LECLERC'
  const carAhead = activeDriver?.car_ahead ?? 'PIA #81'

  const gapAhead = Number(decision?.gap_ahead_s ?? decision?.gap_to_ahead_s ?? activeDriver?.gap_ahead_s ?? 0.82)
  const drsAvailable = Boolean(decision?.drs_available || (gapAhead > 0 && gapAhead <= 1.0))
  const socVal = Number(decision?.soc ?? activeDriver?.soc ?? 0.52)
  const ersPct = Math.round(socVal * 100)
  const tyreLife = Number(decision?.tyre_life_pct ?? activeDriver?.tyre_life_pct ?? 82)
  const fuelPct = Number(decision?.fuel_pct ?? activeDriver?.fuel_pct ?? 64)
  const tyreCompound = decision?.tyre_compound ?? activeDriver?.tyre_compound ?? 'HARD (C2)'
  const stintLaps = decision?.stint_laps ?? `${activeDriver?.tyre_age ?? 8} / 28`
  const pitWindow = 'LAP 34–36'
  const strategyStatus = tyreLife <= 25 ? 'BOX THIS LAP' : lap >= 34 ? 'PIT WINDOW OPEN' : 'STAY OUT (ATTACK WINDOW)'

  // Tactical Risk Analysis
  const riskAnalysis = useMemo(() => {
    const collisionRisk = Math.min(65, Math.max(10, Math.round(15 + (gapAhead < 0.5 ? 25 : 5))))
    const strategicRisk = Math.min(60, Math.max(8, Math.round(18 + (ersPct < 25 ? 28 : 0))))
    const tyreRisk = Math.min(75, Math.max(8, Math.round(14 + (100 - tyreLife) * 0.45)))
    const batteryRisk = Math.min(85, Math.max(10, Math.round(ersPct < 15 ? 55 : ersPct < 30 ? 25 : 10)))

    const avgRisk = Math.round((collisionRisk + strategicRisk + tyreRisk + batteryRisk) / 4)
    let level = 'LOW'
    let levelClass = 'low'
    if (avgRisk >= 45) {
      level = 'HIGH'
      levelClass = 'high'
    } else if (avgRisk >= 25) {
      level = 'MEDIUM'
      levelClass = 'medium'
    }

    return {
      avgRisk,
      level,
      levelClass,
      breakdown: [
        { name: 'COLLISION', pct: collisionRisk },
        { name: 'STRATEGIC', pct: strategicRisk },
        { name: 'TYRE WEAR', pct: tyreRisk },
        { name: 'BATTERY', pct: batteryRisk },
      ],
    }
  }, [gapAhead, ersPct, tyreLife])

  // Contextual Race Engineer Alerts
  const alerts = useMemo(() => {
    const list = []
    if (ersPct <= 15) {
      list.push({ severity: 'critical', text: `BATTERY CRITICAL (${ersPct}% SOC) — MANDATORY HARVEST` })
    } else if (ersPct >= 40) {
      list.push({ severity: 'info', text: `BATTERY SUFFICIENT (${ersPct}% SOC) — 120kW BOOST ARMED` })
    }
    if (drsAvailable) {
      list.push({ severity: 'info', text: 'DRS ACTIVE (REAR WING STALL ZONE CONFIRMED)' })
    }
    if (gapAhead <= 0.85) {
      list.push({ severity: 'critical', text: `ATTACK WINDOW OPEN (GAP ${gapAhead.toFixed(2)}s < 0.85s to ${carAhead})` })
    }
    if (tyreLife <= 25) {
      list.push({ severity: 'critical', text: `BOX THIS LAP FOR HARD C2 (TYRE LIFE ${tyreLife}%)` })
    } else if (tyreLife <= 45) {
      list.push({ severity: 'caution', text: `TYRE THERMAL CLIFF APPROACHING (${tyreLife}% LIFE)` })
    } else {
      list.push({ severity: 'info', text: `TYRE GRIP STABLE (${tyreLife}% LIFE · ${tyreCompound})` })
    }
    return list.slice(0, 4)
  }, [drsAvailable, ersPct, gapAhead, tyreLife, carAhead, tyreCompound])

  return (
    <div className="strategy-forecast-card">
      {/* Top: Section Header & Track Sync */}
      <div className="forecast-header">
        <div className="forecast-title-wrap">
          <span className="forecast-live-dot" />
          <span className="forecast-title">RACE STRATEGY COMMAND & TRACK TELEMETRY</span>
        </div>
        <div className="data-quality-badge">
          <span className="quality-dot-green" />
          <span>FIA TRACK SYNC</span>
        </div>
      </div>

      {/* Ambient Track Weather & Environment Diagnostics */}
      <div className="ambient-weather-strip">
        <div className="ambient-item">
          <span className="amb-k">AIR:</span>
          <span className="amb-v">27.4°C</span>
        </div>
        <div className="ambient-item">
          <span className="amb-k">TRACK:</span>
          <span className="amb-v hot">41.8°C</span>
        </div>
        <div className="ambient-item">
          <span className="amb-k">HUMIDITY:</span>
          <span className="amb-v">48%</span>
        </div>
        <div className="ambient-item">
          <span className="amb-k">WIND:</span>
          <span className="amb-v">2.1 m/s NE</span>
        </div>
        <div className="ambient-item">
          <span className="amb-k">STATUS:</span>
          <span className="amb-v green">GREEN FLAG</span>
        </div>
      </div>

      {/* 1. EMBEDDED LIVE MONZA TRACK MAP */}
      <div className="track-map-container">
        <LiveTrackMap decision={decision} />
      </div>

      {/* 2. STANDARDIZED PIT STRATEGY & TYRE CARD */}
      <div className="race-strategy-card">
        <div className="card-section-title">
          <span>PIT STRATEGY & TYRE ALLOCATION</span>
          <span className={`strategy-status-tag ${tyreLife <= 25 ? 'box' : 'stay'}`}>{strategyStatus}</span>
        </div>

        {/* Highlighted Standardized Pit Strategy Box */}
        <div className="pit-strategy-summary-card" style={{
          background: 'rgba(0, 229, 255, 0.06)',
          border: '1px solid rgba(0, 229, 255, 0.25)',
          borderRadius: '6px',
          padding: '10px 14px',
          marginBottom: '12px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          textAlign: 'center',
        }}>
          <div>
            <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: '700' }}>PIT WINDOW</div>
            <div style={{ fontSize: '13px', fontWeight: '900', color: '#00e5ff', marginTop: '2px' }}>{pitWindow}</div>
          </div>
          <div>
            <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: '700' }}>RECOMMENDED</div>
            <div style={{ fontSize: '13px', fontWeight: '900', color: '#f8fafc', marginTop: '2px' }}>MEDIUM → HARD</div>
          </div>
          <div>
            <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: '700' }}>EXPECTED GAIN</div>
            <div style={{ fontSize: '13px', fontWeight: '900', color: '#22c55e', marginTop: '2px' }}>+1.8s</div>
          </div>
          <div>
            <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: '700' }}>CONFIDENCE</div>
            <div style={{ fontSize: '13px', fontWeight: '900', color: '#38bdf8', marginTop: '2px' }}>87%</div>
          </div>
        </div>

        <div className="strategy-metrics-grid">
          <div className="strat-stat">
            <span className="stat-k">TYRE ALLOCATION</span>
            <span className="stat-v yellow">{tyreCompound} · STINT {stintLaps}</span>
          </div>
          <div className="strat-stat">
            <span className="stat-k">TYRE TREAD LIFE</span>
            <span className={`stat-v ${tyreLife < 30 ? 'red' : 'green'}`}>{tyreLife}%</span>
          </div>
          <div className="strat-stat">
            <span className="stat-k">FUEL ONBOARD</span>
            <span className="stat-v cyan">{fuelPct}% (1.72 kg/lap)</span>
          </div>
          <div className="strat-stat">
            <span className="stat-k">EST STOP DURATION</span>
            <span className="stat-v purple">2.3s STATIONARY</span>
          </div>
        </div>
      </div>

      {/* 3. RACE POSITION FORECAST */}
      <div className="position-forecast-box">
        <div className="pos-box-title">RACE POSITION FORECAST · {driverName}</div>
        <div className="pos-progression-track">
          <div className="pos-node prev">P{prevPos}</div>
          <div className="pos-arrow">→</div>
          <div className="pos-node current">
            <span className="node-lbl">NOW</span>
            P{currentPos}
          </div>
          <div className="pos-arrow">→</div>
          <div className="pos-node target">
            <span className="node-lbl">EST</span>
            P{nextPos}
          </div>
        </div>

        <div className="pos-metrics-grid">
          <div className="pos-stat">
            <span className="stat-k">CURRENT</span>
            <span className="stat-v current-v">P{currentPos} {driverCode}</span>
          </div>
          <div className="pos-stat">
            <span className="stat-k">AFTER PASS</span>
            <span className="stat-v next-v">P{nextPos} {currentPos === 1 ? 'LEAD' : carAhead.split(' ')[0]}</span>
          </div>
          <div className="pos-stat">
            <span className="stat-k">EXPECTED GAIN</span>
            <span className="stat-v gain-v">+1 POS (+2.9s)</span>
          </div>
          <div className="pos-stat">
            <span className="stat-k">CONFIDENCE</span>
            <span className="stat-v conf-v">92%</span>
          </div>
        </div>
      </div>

      {/* 4. TACTICAL RISK METER & BREAKDOWN */}
      <div className="risk-meter-box">
        <div className="risk-meter-header">
          <div className="risk-title-wrap">
            <span className="risk-label">TACTICAL RISK METER</span>
            <span className={`risk-level-tag ${riskAnalysis.levelClass}`}>
              {riskAnalysis.level} ({riskAnalysis.avgRisk}%)
            </span>
          </div>
        </div>

        <div className="risk-segmented-bar">
          {Array.from({ length: 10 }).map((_, i) => (
            <span
              key={i}
              className={`risk-seg ${i < Math.round(riskAnalysis.avgRisk / 10) ? 'active ' + riskAnalysis.levelClass : ''}`}
            />
          ))}
        </div>

        <div className="risk-breakdown-row">
          {riskAnalysis.breakdown.map((b, i) => (
            <div key={i} className="risk-chip">
              <span className="chip-label">{b.name}</span>
              <span className="chip-pct">{b.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* 5. CONTEXTUAL RACE ENGINEER ALERTS */}
      <div className="alerts-box">
        <div className="alerts-title">RACE ENGINEER DIRECTIVES & ALERTS</div>
        <div className="alerts-list">
          {alerts.map((al, i) => (
            <div key={i} className={`alert-row ${al.severity}`}>
              <span className={`alert-dot ${al.severity}`} />
              <span className="alert-text">{al.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
