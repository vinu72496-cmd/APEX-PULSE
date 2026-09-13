import React from 'react'

export default function DriverSidebar({ drivers, activeDriverId, onSelectDriver }) {
  if (!drivers || Object.keys(drivers).length === 0) return null

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.85)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '8px',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      <div style={{
        fontSize: '11px',
        fontWeight: '800',
        letterSpacing: '1px',
        color: '#94a3b8',
        textTransform: 'uppercase',
        marginBottom: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <span>RACE CARS</span>
        <span style={{ color: '#00e5ff', fontSize: '9px' }}>MONZA GP</span>
      </div>

      {Object.entries(drivers).map(([dId, d]) => {
        const isActive = dId === activeDriverId
        const statusDot = d.status === 'GREEN' ? '#22c55e' : (d.status === 'YELLOW' ? '#eab308' : '#ef4444')

        return (
          <button
            key={dId}
            onClick={() => onSelectDriver(dId)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: isActive ? 'rgba(0, 229, 255, 0.12)' : 'rgba(30, 41, 59, 0.5)',
              border: isActive ? '1px solid #00e5ff' : '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '6px',
              padding: '8px 10px',
              cursor: 'pointer',
              textAlign: 'left',
              color: '#f8fafc',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: statusDot,
                boxShadow: `0 0 6px ${statusDot}`
              }} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700' }}>
                  {d.name.split(' ').pop()} <span style={{ color: '#94a3b8', fontSize: '10px' }}>#{d.number}</span>
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>
                  {d.position} · {d.tyre_compound}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#38bdf8' }}>
                {d.gap_ahead_str || (d.gap_ahead_s === 0 ? 'LEAD' : `+${d.gap_ahead_s}s`)}
              </div>
              <div style={{ fontSize: '9px', color: '#94a3b8' }}>
                ERS {Math.round((d.soc || 0.5) * 100)}%
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
