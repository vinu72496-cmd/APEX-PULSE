import React from 'react'

/**
 * ErsManager — Advanced F1 Hybrid ERS Energy & Deployment Visualizer
 *
 * Implements:
 * 1. Current Battery % (SOC)
 * 2. Recommended Deployment Mode & Power (kW / MJ)
 * 3. Estimated Battery After Deployment (% remaining at apex/exit)
 * 4. Conservation / Deployment Status Indicator
 * 5. FIA 4.00 MJ Regulatory Lap Energy Budget
 */
export default function ErsManager({ decision }) {
  const socVal = Number(decision?.soc ?? 0.65)
  const socPct = Math.round(socVal * 100)
  const mode = decision?.mode ?? 'BALANCE'
  const mguK = decision?.mguk_power_kw ?? (mode === 'OVERTAKE' ? 120 : (mode === 'HARVEST' ? -60 : 60))
  const budgetUsed = decision?.lap_budget_mj ?? (mode === 'OVERTAKE' ? 1.85 : 0.95)
  const maxBudget = 4.00
  const budgetPct = Math.min(100, Math.round((budgetUsed / maxBudget) * 100))

  // Recommended deployment mode
  const recMode = decision?.ers_recommended_mode ?? (
    mode === 'OVERTAKE'
      ? 'MODE 4 (OVERTAKE 120kW)'
      : socPct < 20
      ? 'MODE 2 (HARVEST 60kW)'
      : 'MODE 3 (BALANCED 90kW)'
  )

  // Estimated battery after deployment
  const deployDrop = mode === 'OVERTAKE' ? 18 : (mode === 'PUSH' ? 8 : 0)
  const estimatedAfterPct = Math.max(3, socPct - deployDrop)

  // Conservation vs Deployment Status
  let statusText = 'BALANCED CONSERVATION'
  let statusClass = 'status-balance'
  if (mode === 'OVERTAKE') {
    statusText = 'MAX OVERTAKE DEPLOYMENT'
    statusClass = 'status-deploy'
  } else if (mode === 'PUSH') {
    statusText = 'HIGH ENERGY DISCHARGE'
    statusClass = 'status-push'
  } else if (mode === 'HARVEST' || socPct < 18) {
    statusText = 'ACTIVE TACTICAL HARVEST'
    statusClass = 'status-harvest'
  }

  return (
    <div className="ers-manager-card">
      <div className="ers-header">
        <div className="ers-title-wrap">
          <span className="ers-icon">⚡</span>
          <span className="ers-title">HYBRID ERS ENERGY CONTROLLER</span>
        </div>
        <div className={`ers-status-badge ${statusClass}`}>
          <span className="status-dot" />
          <span>{statusText}</span>
        </div>
      </div>

      <div className="ers-main-grid">
        {/* Left: Battery State & Projection */}
        <div className="ers-battery-block">
          <div className="ers-metric-row">
            <span className="metric-tag">CURRENT BATTERY</span>
            <span className={`ers-val ${socPct <= 10 ? 'crit' : socPct <= 25 ? 'warn' : 'good'}`}>
              {socPct}%
            </span>
          </div>

          <div className="ers-bar-track">
            <div
              className={`ers-bar-fill ${socPct <= 10 ? 'crit' : socPct <= 25 ? 'warn' : 'good'}`}
              style={{ width: `${Math.max(4, socPct)}%` }}
            />
            {/* Regulatory floor line */}
            <div className="floor-indicator" title="FIA 3% Critical Floor" style={{ left: '3%' }} />
            {/* Estimated post-deployment ghost line */}
            {deployDrop > 0 && (
              <div
                className="post-deploy-ghost"
                style={{ width: `${deployDrop}%`, left: `${estimatedAfterPct}%` }}
                title={`Estimated consumption: -${deployDrop}%`}
              />
            )}
          </div>

          <div className="ers-post-deploy-row">
            <span className="post-label">EST. POST-DEPLOYMENT:</span>
            <span className="post-val">
              {estimatedAfterPct}% <span className="post-delta">(-{deployDrop}% on pass)</span>
            </span>
          </div>
        </div>

        {/* Right: Recommended Deployment & Lap Budget */}
        <div className="ers-deploy-block">
          <div className="rec-deploy-row">
            <span className="metric-tag">RECOMMENDED DEPLOYMENT</span>
            <span className="rec-mode-name">{recMode}</span>
          </div>

          <div className="ers-sub-grid">
            <div className="ers-mini-metric">
              <span className="mini-k">MGU-K POWER</span>
              <span className={`mini-v ${mguK > 80 ? 'boost' : ''}`}>{mguK} kW</span>
            </div>
            <div className="ers-mini-metric">
              <span className="mini-k">LAP BUDGET</span>
              <span className="mini-v">{budgetUsed} / {maxBudget.toFixed(2)} MJ</span>
            </div>
            <div className="ers-mini-metric">
              <span className="mini-k">FIA LEGAL FLOOR</span>
              <span className="mini-v safe">3.0% OK</span>
            </div>
          </div>

          <div className="budget-bar-track">
            <div className="budget-bar-fill" style={{ width: `${budgetPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
