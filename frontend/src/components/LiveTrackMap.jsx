import React, { useEffect, useRef, useState } from 'react'

/**
 * LiveTrackMap — Monza GP Autodromo Nazionale Live Circuit Map
 * Enhanced to highlight:
 * 1. Active driver car (Cyan / Gold beacon with Driver name & number)
 * 2. Car Ahead with live gap
 * 3. Car Behind with live gap
 * 4. DRS Zone 1 (Main Straight) & DRS Zone 2 (Serraglio)
 * 5. Turn 1 Variante del Rettifilo & Turn 4 Roggia Passing Hotspots
 */
export default function LiveTrackMap({ decision, activeDriver }) {
  const pathRef = useRef(null)
  const [positions, setPositions] = useState({
    player: { x: 180, y: 190 },
    ahead: { x: 220, y: 190 },
    behind: { x: 130, y: 190 },
  })
  const progressRef = useRef(0.28)

  const driverName = activeDriver?.name || 'C. LECLERC'
  const driverNum = activeDriver?.number || 16
  const carAheadName = activeDriver?.car_ahead || decision?.car_ahead || 'PIA #81'
  const carBehindName = activeDriver?.car_behind || 'RUS #63'

  const gapAhead = activeDriver?.gap_ahead_s !== undefined
    ? Number(activeDriver.gap_ahead_s)
    : Number(decision?.gap_ahead_s ?? decision?.gap_to_ahead_s ?? 0.82)

  const gapBehind = activeDriver?.gap_behind_s !== undefined
    ? Number(activeDriver.gap_behind_s)
    : Number(decision?.gap_behind_s ?? 1.14)

  const speed = Number(activeDriver?.speed_kph ?? decision?.speed_kph ?? 325)
  const currentPos = activeDriver?.position || decision?.current_position || 'P4'
  const lap = activeDriver?.lap || decision?.lap || 30

  // Monza layout path definition in a 360 x 210 viewport
  const trackPath = `
    M 270 190
    L 90 190
    Q 75 190 75 178
    L 78 165
    Q 85 155 98 152
    L 140 148
    Q 180 144 215 125
    Q 245 108 260 85
    L 262 70
    Q 262 58 248 58
    L 230 62
    Q 215 62 205 50
    L 180 32
    Q 165 24 145 28
    L 125 32
    Q 108 38 98 52
    L 90 70
    Q 80 85 92 100
    L 115 102
    Q 130 102 145 92
    L 210 70
    Q 240 60 275 60
    L 315 60
    Q 345 60 345 95
    L 345 150
    Q 345 190 300 190
    Z
  `

  const speedRef = useRef(speed)
  speedRef.current = speed

  const gapAheadRef = useRef(gapAhead)
  gapAheadRef.current = gapAhead

  const gapBehindRef = useRef(gapBehind)
  gapBehindRef.current = gapBehind

  const smoothSpeedRef = useRef(speed)
  const smoothGapAheadRef = useRef(gapAhead)
  const smoothGapBehindRef = useRef(gapBehind)

  useEffect(() => {
    let animId
    const step = () => {
      if (pathRef.current) {
        const totalLen = pathRef.current.getTotalLength()

        smoothSpeedRef.current += (speedRef.current - smoothSpeedRef.current) * 0.04
        smoothGapAheadRef.current += (gapAheadRef.current - smoothGapAheadRef.current) * 0.03
        smoothGapBehindRef.current += (gapBehindRef.current - smoothGapBehindRef.current) * 0.03

        const sSpeed = smoothSpeedRef.current
        const sGapAhead = smoothGapAheadRef.current
        const sGapBehind = smoothGapBehindRef.current

        const dt = (sSpeed / 300) * 0.00075
        progressRef.current = (progressRef.current + dt) % 1.0

        const pLen = progressRef.current * totalLen
        const aLen = (pLen + (Math.max(0.2, sGapAhead) * 0.035 * totalLen)) % totalLen
        const bLen = (pLen - (Math.max(0.2, sGapBehind) * 0.025 * totalLen) + totalLen) % totalLen

        const pPt = pathRef.current.getPointAtLength(pLen)
        const aPt = pathRef.current.getPointAtLength(aLen)
        const bPt = pathRef.current.getPointAtLength(bLen)

        setPositions({
          player: { x: pPt.x, y: pPt.y },
          ahead: { x: aPt.x, y: aPt.y },
          behind: { x: bPt.x, y: bPt.y },
        })
      }
      animId = requestAnimationFrame(step)
    }

    animId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <div className="live-track-map-card" style={{
      background: 'rgba(15, 23, 42, 0.85)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '8px',
      padding: '14px',
      marginBottom: '16px'
    }}>
      <div className="track-map-header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        paddingBottom: '8px',
        marginBottom: '12px'
      }}>
        <div className="track-map-title-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="track-icon">🗺️</span>
          <span className="track-title" style={{ fontSize: '11px', fontWeight: '900', letterSpacing: '1px', color: '#f8fafc' }}>
            AUTODROMO NAZIONALE MONZA · LIVE POSITION RADAR
          </span>
        </div>
        <div className="track-meta-chips" style={{ display: 'flex', gap: '6px' }}>
          <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid #22c55e', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '800' }}>
            DRS ACTIVE
          </span>
          <span style={{ background: 'rgba(0, 229, 255, 0.15)', color: '#00e5ff', border: '1px solid #00e5ff', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '800' }}>
            LAP {lap}/50
          </span>
          <span style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '800' }}>
            {currentPos} {driverName}
          </span>
        </div>
      </div>

      <div className="track-svg-wrapper" style={{ position: 'relative', width: '100%', height: '230px' }}>
        <svg
          viewBox="0 0 360 210"
          className="track-svg"
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%' }}
        >
          <defs>
            <filter id="cyanGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="redGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="amberGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Circuit Underlay Glow */}
          <path
            d={trackPath}
            fill="none"
            stroke="rgba(0, 229, 255, 0.08)"
            strokeWidth="14"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Main Asphalt Track */}
          <path
            d={trackPath}
            fill="none"
            stroke="#16202E"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Inner Racing Line */}
          <path
            ref={pathRef}
            d={trackPath}
            fill="none"
            stroke="#223249"
            strokeWidth="2"
            strokeDasharray="4 3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* DRS Zone 1 (Main Straight) */}
          <path
            d="M 280 190 L 105 190"
            fill="none"
            stroke="#76FF03"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.9"
          />

          {/* DRS Zone 2 (Serraglio to Ascari) */}
          <path
            d="M 140 30 L 220 62"
            fill="none"
            stroke="#76FF03"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.9"
          />

          {/* Sector Boundary & Corner Landmarks */}
          <text x="70" y="204" fill="#7E8B9B" fontSize="6.5" fontFamily="monospace">T1 RETTIFILO</text>
          <text x="210" y="142" fill="#7E8B9B" fontSize="6.5" fontFamily="monospace">CURVA GRANDE</text>
          <text x="225" y="44" fill="#7E8B9B" fontSize="6.5" fontFamily="monospace">LESMO (T4)</text>
          <text x="75" y="115" fill="#7E8B9B" fontSize="6.5" fontFamily="monospace">ASCARI</text>
          <text x="300" y="105" fill="#7E8B9B" fontSize="6.5" fontFamily="monospace">PARABOLICA</text>

          {/* Turn 1 & Turn 4 Passing Hotspot Callout Badges */}
          <g transform="translate(60, 172)">
            <rect width="64" height="13" rx="3" fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" strokeWidth="0.8" />
            <text x="4" y="9" fill="#ef4444" fontSize="6" fontWeight="bold" fontFamily="monospace">🎯 T1 PASSING ZONE</text>
          </g>

          <g transform="translate(195, 20)">
            <rect width="64" height="13" rx="3" fill="rgba(234, 179, 8, 0.25)" stroke="#eab308" strokeWidth="0.8" />
            <text x="4" y="9" fill="#eab308" fontSize="6" fontWeight="bold" fontFamily="monospace">⚡ T4 BRAKE DIVE</text>
          </g>

          {/* Car Behind */}
          <g transform={`translate(${positions.behind.x}, ${positions.behind.y})`}>
            <circle r="4.5" fill="#E040FB" opacity="0.9" />
            <circle r="8" fill="none" stroke="#E040FB" strokeWidth="1" opacity="0.4" />
            <text x="8" y="3" fill="#E040FB" fontSize="6.5" fontWeight="bold" fontFamily="monospace">
              {carBehindName} ({activeDriver?.gap_behind_str || `${gapBehind.toFixed(1)}s`})
            </text>
          </g>

          {/* Car Ahead */}
          <g transform={`translate(${positions.ahead.x}, ${positions.ahead.y})`}>
            <circle r="5" fill="#FF3D00" filter="url(#redGlow)" />
            <circle r="9" fill="none" stroke="#FF3D00" strokeWidth="1.2" opacity="0.5" />
            <text x="9" y="3" fill="#FF3D00" fontSize="7" fontWeight="bold" fontFamily="monospace">
              {carAheadName} ({activeDriver?.gap_ahead_str || `${gapAhead.toFixed(2)}s`})
            </text>
          </g>

          {/* Active Driver Car */}
          <g transform={`translate(${positions.player.x}, ${positions.player.y})`}>
            <circle r="6" fill="#00E5FF" filter="url(#cyanGlow)" />
            <circle r="12" fill="none" stroke="#00E5FF" strokeWidth="1.5" opacity="0.6">
              <animate
                attributeName="r"
                values="6;14;6"
                dur="1.6s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.8;0.1;0.8"
                dur="1.6s"
                repeatCount="indefinite"
              />
            </circle>
            <text x="11" y="-5" fill="#00E5FF" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
              {currentPos} {driverName} #{driverNum} (ACTIVE FOCUS)
            </text>
          </g>
        </svg>
      </div>

      <div className="track-legend-row" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '8px',
        paddingTop: '8px',
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        fontSize: '10px',
        color: '#94a3b8'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00E5FF' }} />
          <span><b>ACTIVE:</b> {driverName} #{driverNum}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FF3D00' }} />
          <span><b>AHEAD:</b> {carAheadName} ({activeDriver?.gap_ahead_str || `${gapAhead.toFixed(2)}s`})</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E040FB' }} />
          <span><b>BEHIND:</b> {carBehindName} ({activeDriver?.gap_behind_str || `${gapBehind.toFixed(1)}s`})</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '12px', height: '3px', background: '#76FF03', borderRadius: '2px' }} />
          <span>DRS ZONE</span>
        </div>
      </div>
    </div>
  )
}
