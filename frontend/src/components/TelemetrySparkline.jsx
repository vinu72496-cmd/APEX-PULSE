import React from 'react'

export default function TelemetrySparkline({
  data = [],
  color = '#4FD1C5',
  height = 56,
  min = null,
  max = null,
  unit = '',
  label = '',
  currentValue = null,
}) {
  if (!data || data.length < 2) {
    return (
      <div className="sparkline-wrap">
        <div className="sparkline-head">
          <span className="sparkline-label">{label}</span>
          <span className="sparkline-val">{currentValue !== null ? `${currentValue} ${unit}` : '--'}</span>
        </div>
        <div className="sparkline-empty" style={{ height }}>Awaiting telemetry stream…</div>
      </div>
    )
  }

  const dataMin = min !== null ? min : Math.min(...data)
  const dataMax = max !== null ? max : Math.max(...data)
  const range = dataMax - dataMin === 0 ? 1 : dataMax - dataMin

  const width = 300
  const paddingY = 4
  const innerHeight = height - paddingY * 2

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width
    const normalized = (val - dataMin) / range
    const y = height - paddingY - normalized * innerHeight
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const pathD = `M ${points.join(' L ')}`
  const fillD = `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`
  const gradId = `grad-${color.replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <div className="sparkline-wrap">
      <div className="sparkline-head">
        <span className="sparkline-label">{label}</span>
        <span className="sparkline-val" style={{ color }}>
          {currentValue !== null ? `${currentValue} ${unit}` : '--'}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="sparkline-svg"
        preserveAspectRatio="none"
        style={{ height }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={fillD} fill={`url(#${gradId})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
