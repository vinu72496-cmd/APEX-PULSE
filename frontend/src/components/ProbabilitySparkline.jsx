import React from 'react'

/**
 * ProbabilitySparkline — 30-Second Overtake Probability History Chart
 *
 * Implements Section 16:
 * - Real-time smoothed SVG chart tracing probability over the last 30 seconds
 * - Uses actual calculated probability history
 * - Renders event markers for DRS, Risk spikes, and Recommendation changes
 */
export default function ProbabilitySparkline({
  history = [],
  currentValue = 87,
  height = 54,
}) {
  if (!history || history.length < 2) {
    return (
      <div className="prob-sparkline-wrap">
        <div className="prob-sparkline-head">
          <span className="prob-sparkline-title">OVERTAKE PROBABILITY — LAST 30 SEC</span>
          <span className="prob-sparkline-cur">{currentValue}%</span>
        </div>
        <div className="prob-sparkline-empty" style={{ height }}>
          Accumulating 30-second probability trace…
        </div>
      </div>
    )
  }

  const width = 360
  const padTop = 6
  const padBottom = 6
  const innerH = height - padTop - padBottom

  // Ensure points span 0-100 range
  const pts = history.map((item, idx) => {
    const x = (idx / (history.length - 1)) * width
    const val = typeof item === 'number' ? item : (item.prob ?? 50)
    const norm = Math.max(0, Math.min(100, val)) / 100
    const y = height - padBottom - norm * innerH
    return { x, y, val, event: item.event }
  })

  const pathD = `M ${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`
  const fillD = `M 0,${height} L ${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')} L ${width},${height} Z`

  // Filter notable events for markers
  const eventPins = pts.filter((p) => p.event)

  return (
    <div className="prob-sparkline-wrap">
      <div className="prob-sparkline-head">
        <div className="sparkline-title-group">
          <span className="prob-sparkline-title">OVERTAKE PROBABILITY — LAST 30 SEC</span>
          <span className="sparkline-legend-tag">
            <span className="legend-dot lime" /> DRS
            <span className="legend-dot red" /> RISK
            <span className="legend-dot cyan" /> ACTION
          </span>
        </div>
        <span className="prob-sparkline-cur">{currentValue}%</span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="prob-sparkline-svg"
        preserveAspectRatio="none"
        style={{ height }}
      >
        <defs>
          <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* 50% Midline guide */}
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="rgba(255, 255, 255, 0.08)"
          strokeDasharray="2 3"
          strokeWidth="1"
        />

        {/* Fill area & trace line */}
        <path d={fillD} fill="url(#probGrad)" />
        <path
          d={pathD}
          fill="none"
          stroke="#00E5FF"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Event Markers along the curve */}
        {eventPins.map((pin, i) => {
          let pinColor = '#00E5FF'
          if (pin.event === 'DRS') pinColor = '#76FF03'
          else if (pin.event === 'RISK') pinColor = '#FF3D00'
          return (
            <g key={i} transform={`translate(${pin.x}, ${pin.y})`}>
              <circle r="3.5" fill={pinColor} stroke="#080B0F" strokeWidth="1.5" />
            </g>
          )
        })}

        {/* Current leading point glow */}
        {pts.length > 0 && (
          <circle
            cx={pts[pts.length - 1].x}
            cy={pts[pts.length - 1].y}
            r="3.5"
            fill="#00E5FF"
            stroke="#FFFFFF"
            strokeWidth="1.5"
          />
        )}
      </svg>
    </div>
  )
}
