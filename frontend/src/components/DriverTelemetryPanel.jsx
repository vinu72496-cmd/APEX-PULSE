import React, { useState } from 'react'

/**
 * DriverTelemetryPanel — Left Column: Vehicle Telemetry, Sector Timing & Driver Actions
 *
 * Implements:
 * 1. Live Telemetry: Gear, Speed, RPM 15-LED Rev Lights, Throttle, Brake
 * 2. Real-time Status: Lap, Gap to Car Ahead, DRS, ERS Battery, Tyre Life
 * 3. Sector Performance: S1, S2, S3 deltas, Best Lap, Current Lap, Lap Delta
 * 4. Intelligent Driver Action Buttons: [ ATTACK ], [ DEFEND ], [ HARVEST ], [ PIT ]
 *    Dynamically highlighted with neon glow when AI recommends that action.
 */
export default function DriverTelemetryPanel({ decision, recommendedAction = 'HARVEST', onActionClick = () => {} }) {
  const lap = decision?.lap ?? 14
  const totalLaps = 50
  const speed = decision?.speed_kph ? Math.round(decision.speed_kph) : 318
  const gapAhead = Number(decision?.gap_ahead_s ?? decision?.gap_to_ahead_s ?? 0.52)
  const socVal = Number(decision?.soc ?? 0.46)
  const ersPct = Math.min(100, Math.max(0, Math.round(socVal * 100)))
  const tyreLife = Number(decision?.tyre_life_pct ?? 78)

  // Local active action state for driver interaction
  const [selectedAction, setSelectedAction] = useState(null)
  const activeAction = selectedAction || recommendedAction || (ersPct < 20 ? 'HARVEST' : 'ATTACK')

  // Gear calculation from speed
  let gear = 8
  if (speed < 100) gear = 2
  else if (speed < 140) gear = 3
  else if (speed < 185) gear = 4
  else if (speed < 230) gear = 5
  else if (speed < 270) gear = 6
  else if (speed < 305) gear = 7

  // DRS status
  const drsActive = Boolean(decision?.drs_available || (gapAhead > 0 && gapAhead <= 1.0))
  let drsText = 'UNAVAILABLE'
  let drsClass = 'unavail'
  if (drsActive) {
    if (speed >= 300) {
      drsText = 'ACTIVE'
      drsClass = 'active'
    } else {
      drsText = 'AVAILABLE'
      drsClass = 'available'
    }
  }

  // Throttle & Brake telemetry
  const throttlePct = speed > 260 ? Math.min(100, Math.max(88, Math.round(92 + (speed % 9)))) : 75
  const brakePct = throttlePct > 80 ? 0 : Math.round(100 - throttlePct)

  // RPM calculation with 12-LED rev lights
  const rpm = Math.min(12400, Math.max(10400, Math.round(10800 + (speed % 25) * 48)))
  const revFraction = Math.min(1.0, Math.max(0.15, (rpm - 10000) / 2400))
  const activeLeds = Math.round(revFraction * 12)

  // Sector Performance Timings (Monza GP Autodromo Nazionale - Transponder Loops)
  const sectors = [
    { name: 'TRANS-01 (RETTIFILO)', time: '27.842s', delta: '-0.082s', status: 'purple' },
    { name: 'TRANS-02 (LESMO/ASCARI)', time: '37.114s', delta: '+0.120s', status: 'yellow' },
    { name: 'TRANS-03 (PARABOLICA)', time: '27.765s', delta: '-0.214s', status: 'green' },
  ]

  const driverActions = [
    { key: 'ATTACK', label: 'ATTACK', sub: 'MODE 4 · 120kW BOOST · RETTIFILO', code: '[MODE 4]' },
    { key: 'DEFEND', label: 'DEFEND', sub: 'APEX COVER · INSIDE LINE', code: '[COVER]' },
    { key: 'HARVEST', label: 'HARVEST', sub: 'LIFT & COAST · +35% SOC REGEN', code: '[REGEN]' },
    { key: 'PIT', label: 'PIT', sub: 'BOX BOX · HARD C2 READY', code: '[BOX]' },
  ]

  return (
    <div className="telemetry-panel-card">
      <div className="telem-panel-header">
        <div className="telem-title-wrap">
          <span className="telem-sensor-badge">SECU</span>
          <span className="telem-title">CAN-BUS VEHICLE TELEMETRY</span>
        </div>
        <span className="telem-badge">20Hz SYNC</span>
      </div>

      {/* Hero Dual Cell: Gear & Speed */}
      <div className="telem-hero-row">
        <div className="telem-hero-cell gear-cell">
          <span className="hero-cell-tag">[CH-03] GEAR_INDEX</span>
          <span className="hero-gear-val">{gear}</span>
          <span className="hero-cell-sub">MGU-K SYNC</span>
        </div>

        <div className="telem-hero-cell speed-cell">
          <span className="hero-cell-tag">[CH-01] V_RADAR</span>
          <span className="hero-speed-val">
            {speed} <span className="unit">km/h</span>
          </span>
          <span className="hero-cell-sub">PITOT / RADAR SYNC</span>
        </div>
      </div>

      {/* RPM & Shift Rev Lights Bar */}
      <div className="telem-metric-box rpm-box">
        <div className="metric-box-top">
          <span className="metric-box-label">[CH-02] SECU_RPM</span>
          <span className="metric-box-val rpm-val">{rpm.toLocaleString()} <span className="unit">RPM</span></span>
        </div>
        <div className="rev-lights-mini">
          {Array.from({ length: 12 }).map((_, i) => {
            const isGreen = i < 4
            const isRed = i >= 4 && i < 8
            const isBlue = i >= 8
            const isActive = i < activeLeds
            let col = isGreen ? 'green' : isRed ? 'red' : 'blue'
            return <span key={i} className={`rev-pip ${col} ${isActive ? 'active' : ''}`} />
          })}
        </div>
      </div>

      {/* Throttle & Brake Pedals Grid */}
      <div className="telem-pedals-grid">
        <div className="pedal-box throttle">
          <div className="pedal-top">
            <span className="pedal-label">[CH-04] THROTTLE_POS</span>
            <span className="pedal-val">{throttlePct}%</span>
          </div>
          <div className="pedal-bar-track">
            <div className="pedal-bar-fill throttle-fill" style={{ width: `${throttlePct}%` }} />
          </div>
        </div>

        <div className="pedal-box brake">
          <div className="pedal-top">
            <span className="pedal-label">[CH-05] BRAKE_PRESS</span>
            <span className="pedal-val">{brakePct}%</span>
          </div>
          <div className="pedal-bar-track">
            <div className="pedal-bar-fill brake-fill" style={{ width: `${brakePct}%` }} />
          </div>
        </div>
      </div>

      {/* Metrics Stack: Lap, Gap, DRS, Battery, Tyre */}
      <div className="telem-data-stack">
        <div className="telem-data-row">
          <span className="data-row-key">SESSION LAP</span>
          <span className="data-row-val highlight-lap">
            {lap} <span className="total-lap">/ {totalLaps}</span>
          </span>
        </div>

        <div className="telem-data-row">
          <span className="data-row-key">RADAR INTERVAL AHEAD</span>
          <span className={`data-row-val ${gapAhead < 1.0 ? 'gap-critical' : ''}`}>
            {gapAhead > 0 ? `${gapAhead.toFixed(2)} s` : '--'}
          </span>
        </div>

        <div className="telem-data-row">
          <span className="data-row-key">DRS HYDRAULIC FLAP</span>
          <span className={`drs-status-pill ${drsClass}`}>
            {drsText}
          </span>
        </div>

        <div className="telem-data-row complex">
          <div className="complex-header">
            <span className="data-row-key">[CH-06] ERS_SOC (FIA 3% FLOOR)</span>
            <span className={`data-row-val ${ersPct <= 15 ? 'battery-crit' : 'battery-good'}`}>
              {ersPct}%
            </span>
          </div>
          <div className="telem-mini-bar">
            <div
              className={`telem-mini-bar-fill ${ersPct <= 15 ? 'crit' : ersPct <= 30 ? 'warn' : 'good'}`}
              style={{ width: `${ersPct}%` }}
            />
            <span className="safe-floor-mark" style={{ left: '3%' }} title="3% FIA Floor" />
          </div>
        </div>

        <div className="telem-data-row complex">
          <div className="complex-header">
            <span className="data-row-key">[CH-07] TYRE_TREAD_LIFE (PIRELLI C3)</span>
            <span className={`data-row-val ${tyreLife < 30 ? 'tyre-crit' : 'tyre-good'}`}>
              {tyreLife}%
            </span>
          </div>
          <div className="telem-mini-bar">
            <div
              className={`telem-mini-bar-fill tyre ${tyreLife < 30 ? 'crit' : tyreLife < 60 ? 'warn' : 'good'}`}
              style={{ width: `${tyreLife}%` }}
            />
          </div>
        </div>
      </div>

      {/* SECTOR PERFORMANCE & LAP TIMINGS */}
      <div className="telem-sector-box">
        <div className="sector-box-header">
          <span className="sec-hdr-title">FIA TRANSPONDER SECTOR TIMING</span>
          <span className="sec-lap-delta purple">LAP DELTA: -0.240s</span>
        </div>

        <div className="sectors-list">
          {sectors.map((s, i) => (
            <div key={i} className="sector-item-row">
              <span className="sec-name">{s.name}</span>
              <span className="sec-time">{s.time}</span>
              <span className={`sec-delta-pill ${s.status}`}>{s.delta}</span>
            </div>
          ))}
        </div>

        <div className="lap-records-row">
          <div className="lap-rec">
            <span className="rec-k">BEST LAP</span>
            <span className="rec-v purple">1:32.481</span>
          </div>
          <div className="lap-rec">
            <span className="rec-k">LAST LAP</span>
            <span className="rec-v green">1:32.721</span>
          </div>
        </div>
      </div>

      {/* INTELLIGENT DRIVER ACTION BUTTONS */}
      <div className="driver-actions-panel">
        <div className="actions-header">
          <span className="act-title">TACTICAL DRIVER CONTROLS</span>
          <span className="act-hint">DIRECTIVE SYNC</span>
        </div>

        <div className="driver-actions-grid">
          {driverActions.map((act) => {
            const isAiRecommended = (recommendedAction || '').toUpperCase().includes(act.key)
            const isSelected = activeAction === act.key
            return (
              <button
                key={act.key}
                type="button"
                className={`driver-action-btn ${act.key.toLowerCase()} ${isSelected ? 'active' : ''} ${isAiRecommended ? 'ai-recommended' : ''}`}
                onClick={() => {
                  setSelectedAction(act.key)
                  onActionClick(act.key)
                }}
              >
                <div className="btn-top">
                  <span className="act-code-badge">{act.code}</span>
                  <span className="act-lbl">{act.label}</span>
                  {isAiRecommended && <span className="ai-rec-tag">STRAT DIRECTIVE</span>}
                </div>
                <div className="btn-sub">{act.sub}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
