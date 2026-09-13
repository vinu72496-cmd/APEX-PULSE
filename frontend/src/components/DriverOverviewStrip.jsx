import React from 'react'

export default function DriverOverviewStrip({ drivers, activeDriverId, onSelectDriver }) {
  if (!drivers || Object.keys(drivers).length === 0) return null

  const getStatusColor = (status) => {
    const s = String(status || '').toUpperCase()
    if (s.includes('GREEN') || s.includes('STABLE')) return { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', border: '#22c55e' }
    if (s.includes('YELLOW') || s.includes('WARN')) return { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', border: '#eab308' }
    return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: '#ef4444' }
  }

  const getCompoundColor = (cmp) => {
    const c = String(cmp || '').toUpperCase()
    if (c.includes('SOFT')) return '#ef4444'
    if (c.includes('MEDIUM')) return '#eab308'
    return '#ffffff'
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: '12px',
      marginBottom: '16px'
    }}>
      {Object.entries(drivers).map(([dId, d]) => {
        const isActive = dId === activeDriverId
        const st = getStatusColor(d.status)
        const compColor = getCompoundColor(d.tyre_compound)

        return (
          <div
            key={dId}
            onClick={() => onSelectDriver(dId)}
            style={{
              background: isActive
                ? 'linear-gradient(135deg, rgba(20, 24, 33, 0.95), rgba(15, 23, 42, 0.95))'
                : 'rgba(15, 23, 42, 0.75)',
              border: isActive ? '2px solid #00e5ff' : '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: isActive ? '0 0 16px rgba(0, 229, 255, 0.25)' : 'none',
              borderRadius: '8px',
              padding: '12px 14px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {isActive && (
              <div style={{
                position: 'absolute',
                top: '0',
                right: '0',
                background: '#00e5ff',
                color: '#000',
                fontSize: '9px',
                fontWeight: '900',
                letterSpacing: '1px',
                padding: '2px 8px',
                borderBottomLeftRadius: '6px'
              }}>
                ACTIVE FOCUS
              </div>
            )}

            {/* Header: Name, Position, Status */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#1e293b',
                  border: `1px solid ${st.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  color: '#f8fafc',
                  overflow: 'hidden'
                }}>
                  {d.number}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '800', color: '#f8fafc', letterSpacing: '0.5px' }}>
                      {d.name}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#00e5ff' }}>
                      #{d.number}
                    </span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                    {d.position} · LAP {d.lap || 30}/{d.total_laps || 50}
                  </div>
                </div>
              </div>

              {/* Status Chip */}
              <div style={{
                padding: '2px 8px',
                borderRadius: '4px',
                background: st.bg,
                color: st.text,
                border: `1px solid ${st.border}`,
                fontSize: '10px',
                fontWeight: '700',
                letterSpacing: '0.5px'
              }}>
                {d.status_text || d.status}
              </div>
            </div>

            {/* Metrics Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '6px',
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '8px',
              borderRadius: '6px',
              fontSize: '10px'
            }}>
              <div>
                <div style={{ color: '#64748b' }}>GAP AHEAD</div>
                <div style={{ fontWeight: '700', color: '#f8fafc', marginTop: '2px' }}>
                  {d.gap_ahead_str || (d.gap_ahead_s === 0 ? 'LEADER' : `${d.gap_ahead_s}s`)}
                </div>
              </div>
              <div>
                <div style={{ color: '#64748b' }}>GAP BEHIND</div>
                <div style={{ fontWeight: '700', color: '#f8fafc', marginTop: '2px' }}>
                  {d.gap_behind_str || `${d.gap_behind_s}s`}
                </div>
              </div>
              <div>
                <div style={{ color: '#64748b' }}>TYRE</div>
                <div style={{ fontWeight: '700', color: compColor, marginTop: '2px' }}>
                  {d.tyre_compound} <span style={{ color: '#94a3b8' }}>{d.tyre_age}L</span>
                </div>
              </div>
              <div>
                <div style={{ color: '#64748b' }}>ERS BATTERY</div>
                <div style={{ fontWeight: '700', color: '#38bdf8', marginTop: '2px' }}>
                  {Math.round((d.soc || 0.5) * 100)}%
                </div>
              </div>
            </div>

            {/* Footer Pace & Car Target */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '6px',
              fontSize: '10px',
              color: '#94a3b8'
            }}>
              <span>Target: <strong style={{ color: '#cbd5e1' }}>{d.car_ahead || 'NONE'}</strong></span>
              <span>Pace Delta: <strong style={{ color: d.pace_delta?.includes('-') ? '#22c55e' : '#eab308' }}>{d.pace_delta}</strong></span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
