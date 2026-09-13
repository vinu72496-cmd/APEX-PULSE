import React from 'react'

/**
 * PositionPrediction — Race Finish & Scenario Prediction Engine
 *
 * Displays:
 * 1. Current Position
 * 2. Predicted Position
 * 3. Best Case
 * 4. Worst Case
 */
export default function PositionPrediction({ decision }) {
  const currentPos = decision?.current_position ?? 3
  const predictedPos = decision?.predicted_position ?? 2
  const bestCasePos = decision?.best_case_position ?? 1
  const worstCasePos = decision?.worst_case_position ?? 4
  const lap = decision?.lap ?? 14

  return (
    <div className="position-prediction-card">
      <div className="pos-pred-header">
        <div className="pos-pred-title-wrap">
          <span className="pos-pred-icon">🎯</span>
          <span className="pos-pred-title">RACE POSITION FORECAST</span>
        </div>
        <span className="pos-pred-badge">MONTE CARLO SIM (500 RUNS)</span>
      </div>

      <div className="pos-pred-grid">
        {/* 1. Current Position */}
        <div className="pos-cell current">
          <div className="pos-cell-tag">CURRENT</div>
          <div className="pos-number-hero">P{currentPos}</div>
          <div className="pos-sub-detail">Lap {lap}/50 · Active</div>
        </div>

        {/* 2. Predicted Position */}
        <div className="pos-cell predicted">
          <div className="pos-cell-tag">PREDICTED FINISH</div>
          <div className="pos-number-hero">P{predictedPos}</div>
          <div className="pos-sub-detail">
            <span className="pos-gain-badge">+1 POS GAIN</span>
          </div>
        </div>

        {/* 3. Best Case */}
        <div className="pos-cell best">
          <div className="pos-cell-tag">BEST CASE</div>
          <div className="pos-number-hero">P{bestCasePos}</div>
          <div className="pos-sub-detail">Win Prob: 38%</div>
        </div>

        {/* 4. Worst Case */}
        <div className="pos-cell worst">
          <div className="pos-cell-tag">WORST CASE</div>
          <div className="pos-number-hero">P{worstCasePos}</div>
          <div className="pos-sub-detail">Tyre cliff margin</div>
        </div>
      </div>
    </div>
  )
}
