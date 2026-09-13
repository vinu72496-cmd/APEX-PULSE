import React from 'react'

/**
 * TyreStatusCard — Compact Pirelli F1 Tyre Telemetry & Degradation Card
 *
 * Displays:
 * 1. Compound (Soft C3 / Medium C2 / Hard C1)
 * 2. Tyre Life %
 * 3. Degradation Level (s/lap)
 * 4. Recommended Pit Window
 * 5. 4-Corner Thermal Matrix (FL, FR, RL, RR)
 */
export default function TyreStatusCard({ decision }) {
  const lap = Number(decision?.lap ?? 14)
  const compound = decision?.tyre_compound ?? (lap <= 18 ? 'SOFT' : lap <= 38 ? 'MEDIUM' : 'HARD')
  const tyreLifePct = Number(decision?.tyre_life_pct ?? Math.max(22, 100 - (lap % 25) * 3.4))
  const degRate = decision?.tyre_deg_rate ?? '0.082 s/lap'
  const pitWindow = decision?.pit_window ?? 'Laps 20 - 24'

  // Compound styling
  let compoundColor = '#FF1744'
  let compoundCode = 'C3'
  if (compound === 'MEDIUM') {
    compoundColor = '#FFD600'
    compoundCode = 'C2'
  } else if (compound === 'HARD') {
    compoundColor = '#FFFFFF'
    compoundCode = 'C1'
  }

  // Degradation rating
  let degClass = 'nominal'
  let degText = 'LOW WEAR'
  if (tyreLifePct < 40) {
    degClass = 'critical'
    degText = 'HIGH WEAR'
  } else if (tyreLifePct < 65) {
    degClass = 'warning'
    degText = 'MODERATE'
  }

  // Simulated 4-corner carcass temperatures in optimal thermal window (100-105°C)
  const flTemp = Math.round(102 + (lap % 3) * 1.2)
  const frTemp = Math.round(104 + (lap % 2) * 1.5)
  const rlTemp = Math.round(98 + (lap % 4) * 0.8)
  const rrTemp = Math.round(99 + (lap % 3) * 1.0)

  return (
    <div className="tyre-status-card">
      <div className="tyre-header">
        <div className="tyre-title-wrap">
          <span className="tyre-icon">🛞</span>
          <span className="tyre-title">PIRELLI TYRE STATUS</span>
        </div>
        <div className="tyre-compound-badge" style={{ borderColor: compoundColor }}>
          <span className="compound-circle" style={{ backgroundColor: compoundColor }} />
          <span className="compound-text" style={{ color: compoundColor }}>
            {compound} ({compoundCode})
          </span>
        </div>
      </div>

      <div className="tyre-main-grid">
        {/* Tyre Life & Degradation */}
        <div className="tyre-life-col">
          <div className="tyre-life-top">
            <span className="metric-tag">TYRE LIFE</span>
            <span className={`tyre-life-val ${degClass}`}>{tyreLifePct.toFixed(0)}%</span>
          </div>
          <div className="tyre-bar-track">
            <div
              className={`tyre-bar-fill ${degClass}`}
              style={{ width: `${Math.max(5, tyreLifePct)}%` }}
            />
          </div>
          <div className="tyre-sub-metrics">
            <div className="sub-metric">
              <span className="sub-k">DEG LEVEL</span>
              <span className={`sub-v ${degClass}`}>{degText} ({degRate})</span>
            </div>
            <div className="sub-metric">
              <span className="sub-k">PIT WINDOW</span>
              <span className="sub-v pit-highlight">{pitWindow}</span>
            </div>
          </div>
        </div>

        {/* 4-Corner Carcass Thermal Mini-HUD */}
        <div className="tyre-thermal-col">
          <div className="thermal-label">CARCASS TEMPS</div>
          <div className="thermal-car-grid">
            <div className="thermal-wheel fl">
              <span className="wheel-pos">FL</span>
              <span className="wheel-temp">{flTemp}°C</span>
            </div>
            <div className="thermal-wheel fr">
              <span className="wheel-pos">FR</span>
              <span className="wheel-temp">{frTemp}°C</span>
            </div>
            <div className="thermal-wheel rl">
              <span className="wheel-pos">RL</span>
              <span className="wheel-temp">{rlTemp}°C</span>
            </div>
            <div className="thermal-wheel rr">
              <span className="wheel-pos">RR</span>
              <span className="wheel-temp">{rrTemp}°C</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
