import React, { useState, useEffect, useRef } from 'react'

/**
 * CentralRaceViewer — Professional Curved Formula 1 Circuit Track Viewer
 *
 * Implements authentic Grand Prix track geometry:
 * 1. Curving Monza Variante del Rettifilo (T1 & T2) chicane path
 * 2. Italian Tricolore rumble kerbs (Green-White-Red), gravel traps, and TecPro barriers
 * 3. Dynamic Telemetry Racing Line (Red braking -> Yellow turn-in -> Green acceleration)
 * 4. Cars dynamically yaw and steer into corner apexes (VER #33 & LEC #16)
 * 5. Monza Vector Minimap with live sector telemetry and animated circuit blips
 * 6. 4 Camera Perspectives: CHASE | TRACK | COCKPIT | OVERVIEW
 */
export default function CentralRaceViewer({
  decision,
  lap = 30,
  totalLaps = 50,
}) {
  const [cameraMode, setCameraMode] = useState('TRACK') // 'CHASE' | 'TRACK' | 'COCKPIT' | 'OVERVIEW'
  const canvasRef = useRef(null)

  // Telemetry variables
  const speed = Number(decision?.speed_kph ?? 312)
  const gapAhead = Number(decision?.gap_ahead_s ?? decision?.gap_to_ahead_s ?? 0.380)
  const drsActive = Boolean(decision?.drs_available || gapAhead <= 1.0)
  const ersPct = Math.round(Number(decision?.soc ?? 0.67) * 100)
  const mode = decision?.mode ?? (drsActive ? 'OVERTAKE' : 'PUSH')
  const closingSpeed = Number(decision?.closing_speed_kph ?? (drsActive ? 12.4 : 2.5))
  const isAttack = mode === 'OVERTAKE' || gapAhead <= 0.55
  const isHarvest = mode === 'HARVEST'

  // Preload authentic cockpit onboard photograph for Cockpit camera mode
  const cockpitImgRef = useRef(null)
  useEffect(() => {
    const img = new Image()
    img.src = '/f1_driver_cockpit_view.jpg'
    img.onload = () => {
      cockpitImgRef.current = img
    }
  }, [])

  // Live prop tracking refs so the canvas animation loop never restarts on telemetry updates
  const speedRef = useRef(speed)
  speedRef.current = speed

  const gapAheadRef = useRef(gapAhead)
  gapAheadRef.current = gapAhead

  const cameraModeRef = useRef(cameraMode)
  cameraModeRef.current = cameraMode

  const isAttackRef = useRef(isAttack)
  isAttackRef.current = isAttack

  const drsActiveRef = useRef(drsActive)
  drsActiveRef.current = drsActive

  // Persistent continuous offset that NEVER resets to 0 across re-renders
  const offsetRef = useRef(0)
  const smoothSpeedRef = useRef(speed)
  const smoothGapRef = useRef(gapAhead)
  const attackLerpRef = useRef(0)

  // 4-Car Sequential Simulation State (P1 YOU -> P2 LEC -> P3 SAI -> P4 RUS)
  const [carPositions, setCarPositions] = useState({
    ver: { x: 400, y: 84, angle: 0 },
    lec: { x: 400, y: 180, angle: 0 },
    sai: { x: 400, y: 275, angle: 0 },
    rus: { x: 400, y: 365, angle: 0 },
  })

  // Monza Chicane Curve Math: calculates centerline X for any Y coordinate
  const getTrackCenterX = (y, offset, width, mode) => {
    const scale = mode === 'OVERVIEW' ? 0.0035 : 0.0055
    const progress = (y + offset) * scale
    // Primary chicane S-curve
    const curve1 = Math.sin(progress) * (mode === 'OVERVIEW' ? 90 : 130)
    // Secondary apex transition
    const curve2 = Math.sin(progress * 2) * (mode === 'OVERVIEW' ? 35 : 48)
    return width * 0.5 + curve1 + curve2
  }

  // Canvas animation loop for realistic high-speed track motion & vehicle cornering
  useEffect(() => {
    let animId

    const render = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      const width = canvas.width
      const height = canvas.height

      const currentCameraMode = cameraModeRef.current
      const rawSpeed = Number(speedRef.current || 312)
      const rawGap = Number(gapAheadRef.current || 0.38)
      const currentAttack = isAttackRef.current
      const currentDrsActive = drsActiveRef.current

      // Continuous low-pass smoothing on velocity & gap to prevent any telemetric jumps
      smoothSpeedRef.current += (rawSpeed - smoothSpeedRef.current) * 0.05
      smoothGapRef.current += (rawGap - smoothGapRef.current) * 0.04
      const currentSpeed = smoothSpeedRef.current
      const currentGapAhead = smoothGapRef.current

      // Velocity factor: higher speed = faster track movement
      const velocity = Math.max(6, (currentSpeed / 300) * (currentCameraMode === 'OVERVIEW' ? 9 : 18))
      // Offset accumulates monotonically without EVER resetting to 0
      offsetRef.current += velocity
      const offset = offsetRef.current

      ctx.clearRect(0, 0, width, height)

      // =========================================================================
      // CAMERA MODE: COCKPIT (FIRST-PERSON ONBOARD PERSPECTIVE)
      // =========================================================================
      if (currentCameraMode === 'COCKPIT') {
        if (cockpitImgRef.current && cockpitImgRef.current.complete) {
          // Draw authentic F1 onboard cockpit photograph
          ctx.drawImage(cockpitImgRef.current, 0, 0, width, height)
          // Subtle telemetry tint overlay for readability
          ctx.fillStyle = 'rgba(5, 10, 18, 0.28)'
          ctx.fillRect(0, 0, width, height)
        } else {
          // Fallback procedural sky & grandstands
          const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.45)
          skyGrad.addColorStop(0, '#070C12')
          skyGrad.addColorStop(1, '#131F2E')
          ctx.fillStyle = skyGrad
          ctx.fillRect(0, 0, width, height * 0.45)

          // Monza trees / canopy silhouette along horizon
          ctx.fillStyle = '#0B150F'
          for (let x = 0; x < width; x += 30) {
            const treeH = 20 + Math.sin(x * 0.05) * 8
            ctx.fillRect(x, height * 0.45 - treeH, 24, treeH)
          }

          // Grass & runoffs
          ctx.fillStyle = '#101B12'
          ctx.fillRect(0, height * 0.45, width, height * 0.55)
        }

        // Perspective vanishing point & track road
        const vpX = width * 0.5 + Math.sin(offset * 0.005) * 60
        const vpY = height * 0.45

        // Road Polygon (semi-transparent if photo loaded)
        const roadBottomW = width * 0.88
        const roadTopW = width * 0.06
        const roadLeft = (width - roadBottomW) * 0.5
        const roadRight = roadLeft + roadBottomW

        if (!cockpitImgRef.current || !cockpitImgRef.current.complete) {
          ctx.fillStyle = '#10141A'
          ctx.beginPath()
          ctx.moveTo(vpX - roadTopW * 0.5, vpY)
          ctx.lineTo(vpX + roadTopW * 0.5, vpY)
          ctx.lineTo(roadRight, height)
          ctx.lineTo(roadLeft, height)
          ctx.closePath()
          ctx.fill()
        }

        // Perspective Kerbs (Italian Tricolore scrolling forward)
        const kerbSegs = 18
        for (let i = 0; i < kerbSegs; i++) {
          const p1 = Math.pow(i / kerbSegs, 2)
          const p2 = Math.pow((i + 1) / kerbSegs, 2)
          const y1 = vpY + (height - vpY) * p1
          const y2 = vpY + (height - vpY) * p2

          const kw1 = (width * 0.04) * p1
          const kw2 = (width * 0.04) * p2

          const xl1 = roadLeft + (vpX - roadTopW * 0.5 - roadLeft) * (1 - p1)
          const xl2 = roadLeft + (vpX - roadTopW * 0.5 - roadLeft) * (1 - p2)
          const xr1 = roadRight + (vpX + roadTopW * 0.5 - roadRight) * (1 - p1)
          const xr2 = roadRight + (vpX + roadTopW * 0.5 - roadRight) * (1 - p2)

          const colorIdx = Math.floor((i + Math.floor(offset * 0.15)) % 3)
          const kerbCol = colorIdx === 0 ? '#C62828' : colorIdx === 1 ? '#FAFAFA' : '#2E7D32'

          ctx.fillStyle = kerbCol
          // Left kerb
          ctx.beginPath()
          ctx.moveTo(xl1 - kw1, y1)
          ctx.lineTo(xl1, y1)
          ctx.lineTo(xl2, y2)
          ctx.lineTo(xl2 - kw2, y2)
          ctx.closePath()
          ctx.fill()

          // Right kerb
          ctx.beginPath()
          ctx.moveTo(xr1, y1)
          ctx.lineTo(xr1 + kw1, y1)
          ctx.lineTo(xr2 + kw2, y2)
          ctx.lineTo(xr2, y2)
          ctx.closePath()
          ctx.fill()
        }

        // Braking distance boards in perspective (100m)
        const boardP = ((offset * 0.08) % 100) / 100
        if (boardP > 0.1) {
          const by = vpY + (height - vpY) * Math.pow(boardP, 2)
          const bw = 32 * boardP
          const bh = 18 * boardP
          const bx = roadLeft * (1 - boardP) + (vpX - roadTopW * 0.5) * (1 - (1 - boardP)) - bw - 6
          ctx.fillStyle = '#000000'
          ctx.fillRect(bx, by - bh, bw, bh)
          ctx.strokeStyle = '#FFFFFF'
          ctx.lineWidth = 1.5
          ctx.strokeRect(bx, by - bh, bw, bh)
          ctx.fillStyle = '#FFFFFF'
          ctx.font = `bold ${Math.max(7, Math.floor(10 * boardP))}px "Space Mono", monospace`
          ctx.fillText('100m', bx + 2, by - 4)
        }

        // Rival Car (LEC #16) ahead in perspective
        const rivalP = Math.max(0.42, 0.72 - currentGapAhead * 0.35)
        const rivalY = vpY + (height - vpY) * rivalP
        const rivalW = 110 * rivalP
        const rivalH = 50 * rivalP
        const rivalX = (roadLeft + (roadRight - roadLeft) * 0.5) * (1 - rivalP) + vpX * rivalP - rivalW * 0.5 + (currentAttack ? -35 * rivalP : 0)

        // Draw Ferrari rear in perspective
        ctx.fillStyle = '#B71C1C'
        ctx.fillRect(rivalX + rivalW * 0.2, rivalY - rivalH * 0.7, rivalW * 0.6, rivalH * 0.6)
        // Rear wing
        ctx.fillStyle = '#1C1C1C'
        ctx.fillRect(rivalX, rivalY - rivalH * 0.95, rivalW, rivalH * 0.25)
        // Red flashing rain light
        ctx.fillStyle = (Math.floor(offset * 0.2) % 2 === 0) ? '#FF1744' : '#550000'
        ctx.fillRect(rivalX + rivalW * 0.46, rivalY - rivalH * 0.4, rivalW * 0.08, rivalH * 0.15)
        // Rear Pirelli tyres
        ctx.fillStyle = '#111'
        ctx.fillRect(rivalX - rivalW * 0.12, rivalY - rivalH * 0.6, rivalW * 0.22, rivalH * 0.75)
        ctx.fillRect(rivalX + rivalW * 0.90, rivalY - rivalH * 0.6, rivalW * 0.22, rivalH * 0.75)

        // In Cockpit Foreground: Carbon Halo Pillar & Driver Steering Wheel
        // Titanium Halo Pillar
        ctx.fillStyle = '#0E1318'
        ctx.beginPath()
        ctx.moveTo(width * 0.5 - 12, height)
        ctx.lineTo(width * 0.5 - 7, vpY + 20)
        ctx.lineTo(width * 0.5 + 7, vpY + 20)
        ctx.lineTo(width * 0.5 + 12, height)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = '#00E5FF'
        ctx.lineWidth = 1
        ctx.stroke()

        // Carbon Nosecone
        ctx.fillStyle = '#0B1320'
        ctx.beginPath()
        ctx.moveTo(width * 0.44, height)
        ctx.lineTo(width * 0.49, height * 0.62)
        ctx.lineTo(width * 0.51, height * 0.62)
        ctx.lineTo(width * 0.56, height)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#FFD600'
        ctx.fillRect(width * 0.49, height * 0.64, width * 0.02, 24)

        // Red Bull Steering Wheel in Cockpit Bottom
        const steerAngle = Math.sin(offset * 0.025) * 14
        ctx.save()
        ctx.translate(width * 0.5, height - 15)
        ctx.rotate((steerAngle * Math.PI) / 180)

        // Wheel body
        ctx.fillStyle = '#14181F'
        ctx.beginPath()
        ctx.roundRect(-140, -50, 280, 80, [18, 18, 8, 8])
        ctx.fill()
        ctx.strokeStyle = '#223247'
        ctx.lineWidth = 2
        ctx.stroke()

        // Alcantara grips
        ctx.fillStyle = '#0A0A0A'
        ctx.fillRect(-145, -45, 30, 70)
        ctx.fillRect(115, -45, 30, 70)

        // Center DDU mini screen
        ctx.fillStyle = '#05070A'
        ctx.fillRect(-65, -42, 130, 52)
        ctx.strokeStyle = '#00E5FF'
        ctx.lineWidth = 1
        ctx.strokeRect(-65, -42, 130, 52)

        // Rev LEDs
        const pips = 12
        const actPips = Math.min(12, Math.floor((currentSpeed / 320) * 12))
        for (let p = 0; p < pips; p++) {
          ctx.fillStyle = p < actPips ? (p < 4 ? '#00E676' : p < 8 ? '#FF1744' : '#D500F9') : '#1E293B'
          ctx.fillRect(-58 + p * 10, -40, 7, 5)
        }

        // Gear & Speed HUD on Wheel
        ctx.fillStyle = '#00E5FF'
        ctx.font = 'bold 22px "Space Mono", monospace'
        ctx.textAlign = 'center'
        ctx.fillText('7', 0, -10)
        ctx.font = 'bold 11px "Space Mono", monospace'
        ctx.fillStyle = '#FFFFFF'
        ctx.fillText(`${Math.round(currentSpeed)} KM/H`, 0, 5)

        ctx.restore()

        animId = requestAnimationFrame(render)
        return
      }

      // =========================================================================
      // CAMERA MODES: TRACK, CHASE, OVERVIEW (AUTHENTIC CURVED F1 TRACK)
      // =========================================================================

      // 1. Grass & Gravel Runoff Verge
      ctx.fillStyle = currentCameraMode === 'OVERVIEW' ? '#0C130D' : '#111B13'
      ctx.fillRect(0, 0, width, height)

      // Lawn stripes texture
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
      for (let y = 0; y < height; y += 18) {
        ctx.fillRect(0, y, width, 9)
      }

      const trackWidth = currentCameraMode === 'OVERVIEW' ? width * 0.46 : width * 0.56
      const halfW = trackWidth * 0.5
      const sliceH = 4
      const slices = Math.ceil(height / sliceH)

      // 2. Draw Curved Track Slices with Gravel Traps & Italian Kerbs
      const trackPoints = []

      for (let i = 0; i <= slices; i++) {
        const y = i * sliceH
        const cx = getTrackCenterX(y, offset, width, currentCameraMode)
        const lx = cx - halfW
        const rx = cx + halfW
        trackPoints.push({ y, cx, lx, rx })
      }

      // 2A. Gravel Traps (Textured Pebble Runoffs on corner outsides)
      trackPoints.forEach((pt) => {
        const curvature = pt.cx - width * 0.5
        if (curvature > 35) {
          // Sharp right turn -> Gravel on Left outside
          ctx.fillStyle = '#8D7B68'
          ctx.fillRect(0, pt.y, Math.max(0, pt.lx - 12), sliceH)
          ctx.fillStyle = '#6D5B48'
          if ((pt.y + Math.floor(offset)) % 8 < 4) {
            ctx.fillRect(0, pt.y, Math.max(0, pt.lx - 16), sliceH)
          }
        } else if (curvature < -35) {
          // Sharp left turn -> Gravel on Right outside
          ctx.fillStyle = '#8D7B68'
          ctx.fillRect(pt.rx + 12, pt.y, width - (pt.rx + 12), sliceH)
          ctx.fillStyle = '#6D5B48'
          if ((pt.y + Math.floor(offset)) % 8 < 4) {
            ctx.fillRect(pt.rx + 16, pt.y, width - (pt.rx + 16), sliceH)
          }
        }
      })

      // 2B. Asphalt Track Surface Polygon
      ctx.fillStyle = '#0F1318'
      ctx.beginPath()
      ctx.moveTo(trackPoints[0].lx, trackPoints[0].y)
      for (let i = 1; i < trackPoints.length; i++) {
        ctx.lineTo(trackPoints[i].lx, trackPoints[i].y)
      }
      for (let i = trackPoints.length - 1; i >= 0; i--) {
        ctx.lineTo(trackPoints[i].rx, trackPoints[i].y)
      }
      ctx.closePath()
      ctx.fill()

      // Rubberized Racing Groove (Darker asphalt track line where cars lay rubber)
      ctx.fillStyle = '#090D12'
      trackPoints.forEach((pt) => {
        ctx.fillRect(pt.cx - 24, pt.y, 48, sliceH)
      })

      // 2C. DRS Activation Zone Subtle Highlighting
      if (currentDrsActive) {
        ctx.fillStyle = 'rgba(0, 230, 118, 0.05)'
        trackPoints.forEach((pt) => {
          ctx.fillRect(pt.lx, pt.y, trackWidth, sliceH)
        })
      }

      // 2D. Monza Rumble Kerbs (Italian Green-White-Red Tricolore Following the Curve)
      const kerbWidth = currentCameraMode === 'OVERVIEW' ? 10 : 14
      const kerbCycle = 32

      trackPoints.forEach((pt) => {
        const segIdx = Math.floor((pt.y + offset) / kerbCycle)
        const colIdx = Math.abs(segIdx) % 3
        const kerbColor = colIdx === 0 ? '#C62828' : colIdx === 1 ? '#FAFAFA' : '#2E7D32'

        ctx.fillStyle = kerbColor
        // Left kerb following curve
        ctx.fillRect(pt.lx - kerbWidth, pt.y, kerbWidth, sliceH)
        // Right kerb following curve
        ctx.fillRect(pt.rx, pt.y, kerbWidth, sliceH)
      })

      // 2E. Boundary Solid White Lines
      ctx.fillStyle = '#FFFFFF'
      trackPoints.forEach((pt) => {
        ctx.fillRect(pt.lx, pt.y, 2.5, sliceH)
        ctx.fillRect(pt.rx - 2.5, pt.y, 2.5, sliceH)
      })

      // 2F. Dynamic Telemetry Racing Line (Color-Coded: Red Braking -> Yellow Apex -> Green Exit)
      ctx.lineWidth = 2.5
      for (let i = 0; i < trackPoints.length - 1; i++) {
        const pt1 = trackPoints[i]
        const pt2 = trackPoints[i + 1]

        // Curvature calculation for braking vs apex vs acceleration
        const curveOffset = Math.sin((pt1.y + offset) * 0.0055)
        const isBraking = curveOffset > 0.4
        const isApex = Math.abs(curveOffset) <= 0.4 && curveOffset > -0.2

        ctx.strokeStyle = isBraking
          ? 'rgba(255, 61, 0, 0.75)'
          : isApex
          ? 'rgba(255, 214, 0, 0.75)'
          : 'rgba(0, 230, 118, 0.65)'

        ctx.beginPath()
        ctx.moveTo(pt1.cx + curveOffset * 32, pt1.y)
        ctx.lineTo(pt2.cx + curveOffset * 32, pt2.y)
        ctx.stroke()
      }

      // 2G. Distance Braking Boards (200m, 150m, 100m, 50m to T1 Chicane)
      const boardDistances = ['200m', '150m', '100m', '50m']
      const boardPeriod = height * 2.2
      boardDistances.forEach((dist, idx) => {
        const boardY = (offset * 1.6 + idx * 140) % boardPeriod - 50
        if (boardY >= -20 && boardY <= height) {
          const pt = trackPoints.find((p) => Math.abs(p.y - boardY) < 3)
          if (pt) {
            ctx.fillStyle = '#000000'
            ctx.fillRect(pt.lx - 46, boardY, 32, 16)
            ctx.strokeStyle = '#FFFFFF'
            ctx.lineWidth = 1.2
            ctx.strokeRect(pt.lx - 46, boardY, 32, 16)
            ctx.fillStyle = '#FFFFFF'
            ctx.font = 'bold 9px "Space Mono", monospace'
            ctx.textAlign = 'center'
            ctx.fillText(dist, pt.lx - 30, boardY + 12)
          }
        }
      })

      // 2H. Start / Finish Line & DRS Detection Laser Line
      const finishY = (offset * 2.2) % (height * 3.5) - 40
      if (finishY >= 0 && finishY <= height) {
        const pt = trackPoints.find((p) => Math.abs(p.y - finishY) < 4)
        if (pt) {
          // Checkered line
          const sqSize = 8
          const cols = Math.ceil(trackWidth / sqSize)
          for (let r = 0; r < 2; r++) {
            for (let c = 0; c < cols; c++) {
              ctx.fillStyle = (r + c) % 2 === 0 ? '#FFFFFF' : '#000000'
              ctx.fillRect(pt.lx + c * sqSize, finishY + r * sqSize, sqSize, sqSize)
            }
          }
          ctx.fillStyle = '#FFD600'
          ctx.font = 'bold 8px "Space Mono", monospace'
          ctx.textAlign = 'left'
          ctx.fillText('FINISH LINE / SPEED TRAP 342.1 KM/H', pt.lx + 6, finishY - 4)
        }
      }

      // -------------------------------------------------------------
      // CALCULATE REAL-TIME DYNAMIC CAR COORDINATES IN STRICT SEQUENTIAL ORDER
      // -------------------------------------------------------------
      // Sequential F1 Race Formation:
      // Lead car (P1 YOU · VER #33) leads in front.
      // P2 (LEC #16) trails in sequential order behind P1 (+0.380s).
      // P3 (SAI #55) trails in sequential order behind P2 (+1.214s).
      // P4 (RUS #63) trails in sequential order behind P3 (+4.162s).
      
      // Attack transition smoothing with gentle damping
      const targetAttack = currentAttack ? 1.0 : 0.0
      attackLerpRef.current += (targetAttack - attackLerpRef.current) * 0.02
      const aLerp = attackLerpRef.current

      // Longitudinal Y Coordinates (Strictly Sequential: P1 ahead -> P2 -> P3 -> P4)
      const verY = (currentCameraMode === 'CHASE' ? height * 0.16 : height * 0.20) + aLerp * 16
      // P2 draws alongside P1 when attacking, but never rushes over or clips
      const lecY = (verY + 92 + Math.min(35, currentGapAhead * 28)) * (1 - aLerp) + (verY + 16) * aLerp
      const saiY = Math.max(lecY + 88, verY + 118)
      const rusY = saiY + 86

      // Lateral X Coordinates (Centerline + Racing Line + Battle Separation)
      const verCtr = getTrackCenterX(verY, offset, width, currentCameraMode)
      const lecCtr = getTrackCenterX(lecY, offset, width, currentCameraMode)
      const saiCtr = getTrackCenterX(saiY, offset, width, currentCameraMode)
      const rusCtr = getTrackCenterX(rusY, offset, width, currentCameraMode)

      // When normal: all cars follow the rubberized racing groove
      // When attacking: P1 defends inside (+28px), P2 attacks outside (-36px)
      // Separation between P1 and P2 is 28 - (-36) = 64px (clean racing room!)
      const verApex = Math.sin((verY + offset) * 0.0055) * 16
      const lecApex = Math.sin((lecY + offset) * 0.0055) * 16
      const saiApex = Math.sin((saiY + offset) * 0.0055) * 12
      const rusApex = Math.sin((rusY + offset) * 0.0055) * 10

      const verX = verCtr + verApex * (1 - aLerp) + (aLerp * 28)
      const lecX = lecCtr + lecApex * (1 - aLerp) - (aLerp * 36)
      const saiX = saiCtr + saiApex
      const rusX = rusCtr + rusApex

      // Calculate tangent angles for realistic corner steering yaw
      const dy = 14
      const verTan = getTrackCenterX(verY - dy, offset, width, currentCameraMode) - getTrackCenterX(verY + dy, offset, width, currentCameraMode)
      const lecTan = getTrackCenterX(lecY - dy, offset, width, currentCameraMode) - getTrackCenterX(lecY + dy, offset, width, currentCameraMode)
      const saiTan = getTrackCenterX(saiY - dy, offset, width, currentCameraMode) - getTrackCenterX(saiY + dy, offset, width, currentCameraMode)
      const rusTan = getTrackCenterX(rusY - dy, offset, width, currentCameraMode) - getTrackCenterX(rusY + dy, offset, width, currentCameraMode)

      const verAngle = Math.atan2(verTan, -2 * dy) * (180 / Math.PI)
      const lecAngle = Math.atan2(lecTan, -2 * dy) * (180 / Math.PI)
      const saiAngle = Math.atan2(saiTan, -2 * dy) * (180 / Math.PI)
      const rusAngle = Math.atan2(rusTan, -2 * dy) * (180 / Math.PI)

      setCarPositions({
        ver: { x: verX, y: verY, angle: verAngle },
        lec: { x: lecX, y: lecY, angle: lecAngle },
        sai: { x: saiX, y: saiY, angle: saiAngle },
        rus: { x: rusX, y: rusY, angle: rusAngle },
      })

      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <div className={`central-race-viewer-card view-mode-${cameraMode.toLowerCase()}`}>
      {/* 1. TOP HEADER: LIVE RACE · LAP 30 / 50 · MONZA — T1 / RETTIFILO */}
      <div className="race-sim-header">
        <div className="sim-title-lockup">
          <span className="live-pulse-dot" />
          <span className="sim-live-tag">LIVE CIRCUIT</span>
          <span className="sim-sep">·</span>
          <span className="sim-lap-tag">LAP {decision?.lap ?? lap} / {totalLaps}</span>
          <span className="sim-sep">·</span>
          <span className="sim-circuit-tag">MONZA — T1 VARIANTE DEL RETTIFILO</span>
        </div>

        {/* Camera Selector: CHASE | TRACK | COCKPIT | OVERVIEW */}
        <div className="camera-view-selector">
          <button
            className={`cam-mode-btn ${cameraMode === 'CHASE' ? 'active' : ''}`}
            onClick={() => setCameraMode('CHASE')}
            title="Driver-focused Chase Cam"
          >
            CHASE
          </button>
          <button
            className={`cam-mode-btn ${cameraMode === 'TRACK' ? 'active' : ''}`}
            onClick={() => setCameraMode('TRACK')}
            title="Grand Prix Circuit Broadcast"
          >
            TRACK
          </button>
          <button
            className={`cam-mode-btn ${cameraMode === 'COCKPIT' ? 'active' : ''}`}
            onClick={() => setCameraMode('COCKPIT')}
            title="First-Person Driver Cockpit & Steering Wheel"
          >
            COCKPIT
          </button>
          <button
            className={`cam-mode-btn ${cameraMode === 'OVERVIEW' ? 'active' : ''}`}
            onClick={() => setCameraMode('OVERVIEW')}
            title="Full Tactical Overview"
          >
            OVERVIEW
          </button>
        </div>
      </div>

      {/* 2. RACING CANVAS VIEWPORT */}
      <div className={`racing-canvas-wrapper cam-view-${cameraMode.toLowerCase()}`}>
        {/* Animated Curved Track Canvas */}
        <canvas
          ref={canvasRef}
          width={800}
          height={380}
          className="racing-track-canvas"
        />

        {/* Only show top-down cars in CHASE, TRACK, and OVERVIEW modes */}
        {cameraMode !== 'COCKPIT' && (
          <>
            {/* Dynamic Aero Slipstream Suction Streamlines behind Lead Car */}
            {drsActive && (
              <div
                className="slipstream-wake-ribbon"
                style={{
                  left: `${carPositions.ver.x}px`,
                  top: `${carPositions.ver.y + 40}px`,
                  height: `${Math.max(20, carPositions.lec.y - carPositions.ver.y - 30)}px`,
                  transform: `translateX(-50%) rotate(${carPositions.ver.angle * 0.5}deg)`,
                }}
              >
                <div className="slipstream-ray ray-1" />
                <div className="slipstream-ray ray-2" />
                <div className="slipstream-ray ray-3" />
              </div>
            )}

            {/* -------------------------------------------------------------
                CAR 1: RACE LEADER (RED BULL RACING · VER #33 · YOU)
                ------------------------------------------------------------- */}
            <div
              className={`f1-car-entity car-chaser ${isAttack ? 'attacking' : ''}`}
              style={{
                left: `${carPositions.ver.x}px`,
                top: `${carPositions.ver.y}px`,
                transform: `translate(-50%, -50%) rotate(${carPositions.ver.angle}deg)`,
                zIndex: 10,
              }}
            >
              <div className="floating-car-label hero-label">
                <span className="lbl-pos hero">P1 YOU</span>
                <span className="lbl-code">VER #33</span>
                <span className="lbl-spd cyan">{speed} KM/H</span>
                {drsActive && <span className="lbl-drs-tag">DRS OPEN</span>}
              </div>

              {/* Red Bull F1 Car SVG */}
              <svg className="f1-car-svg" viewBox="0 0 70 160" width="48" height="110">
                {/* Dynamic DRS Rear Wing Flap: Physically tilts open when DRS Active */}
                <rect
                  x="12"
                  y={drsActive ? 129 : 133}
                  width="46"
                  height={drsActive ? 5 : 10}
                  rx="1.5"
                  fill={drsActive ? '#00E676' : '#0B1526'}
                  stroke={drsActive ? '#76FF03' : '#00E5FF'}
                  strokeWidth="1.5"
                  className="drs-rear-wing-flap"
                />
                <rect x="22" y="142" width="26" height="4" fill="#D50000" />
                {/* Rear Wheels */}
                <rect x="2" y="105" width="13" height="34" rx="3" fill="#111111" />
                <rect x="4" y="112" width="3" height="20" fill="#FFD600" />
                <rect x="55" y="105" width="13" height="34" rx="3" fill="#111111" />
                <rect x="63" y="112" width="3" height="20" fill="#FFD600" />
                {/* Suspension Arms */}
                <line x1="14" y1="120" x2="26" y2="120" stroke="#90A4AE" strokeWidth="2" />
                <line x1="44" y1="120" x2="56" y2="120" stroke="#90A4AE" strokeWidth="2" />
                {/* Main Chassis / Sidepods (Red Bull Navy Blue) */}
                <path
                  d="M 27 25 Q 35 15 43 25 L 45 65 Q 52 75 50 115 L 42 130 L 28 130 L 20 115 Q 18 75 25 65 Z"
                  fill="#0F1B2D"
                  stroke="#00E5FF"
                  strokeWidth="1.5"
                />
                {/* Red Bull Bull Graphic */}
                <path d="M 31 55 L 35 45 L 39 55 L 37 95 L 33 95 Z" fill="#D50000" />
                <circle cx="35" cy="50" r="4" fill="#FFD600" />
                {/* Cockpit Halo & Driver Helmet */}
                <ellipse cx="35" cy="74" rx="7" ry="12" fill="#080D14" />
                <circle cx="35" cy="72" r="5" fill="#FFB300" />
                <path d="M 30 68 Q 35 60 40 68" stroke="#00E5FF" strokeWidth="3" fill="none" />
                {/* Front Suspension */}
                <line x1="14" y1="42" x2="27" y2="44" stroke="#90A4AE" strokeWidth="2" />
                <line x1="43" y1="44" x2="56" y2="42" stroke="#90A4AE" strokeWidth="2" />
                {/* Front Wheels */}
                <rect x="3" y="28" width="12" height="30" rx="3" fill="#111111" />
                <rect x="5" y="34" width="3" height="18" fill="#FFD600" />
                <rect x="55" y="28" width="12" height="30" rx="3" fill="#111111" />
                <rect x="62" y="34" width="3" height="18" fill="#FFD600" />
                {/* Front Nose & Wing */}
                <path d="M 31 25 L 35 6 L 39 25 Z" fill="#FFD600" />
                <rect x="8" y="4" width="54" height="8" rx="2" fill="#0A111E" stroke="#D50000" strokeWidth="1" />
                <rect x="29" y="16" width="12" height="7" rx="1" fill="#D50000" />
              </svg>

              {/* MGU-K Boost Energy Aura */}
              {isAttack && <div className="car-boost-aura" />}
            </div>

            {/* -------------------------------------------------------------
                CAR 2: PURSUING RIVAL (SCUDERIA FERRARI · LEC #16)
                ------------------------------------------------------------- */}
            <div
              className="f1-car-entity car-leader"
              style={{
                left: `${carPositions.lec.x}px`,
                top: `${carPositions.lec.y}px`,
                transform: `translate(-50%, -50%) rotate(${carPositions.lec.angle}deg)`,
                zIndex: 8,
              }}
            >
              <div className="floating-car-label rival-label">
                <span className="lbl-pos">P2</span>
                <span className="lbl-code">LEC #16</span>
                <span className="lbl-spd">+{gapAhead.toFixed(3)}s</span>
              </div>

              {/* Ferrari F1 Car SVG */}
              <svg className="f1-car-svg" viewBox="0 0 70 160" width="48" height="110">
                {/* Rear Wing */}
                <rect x="12" y="132" width="46" height="12" rx="2" fill="#1C1C1C" stroke="#C62828" strokeWidth="1.5" />
                <rect x="22" y="142" width="26" height="4" fill="#E53935" />
                {/* Rear Wheels */}
                <rect x="2" y="105" width="13" height="34" rx="3" fill="#141414" />
                <rect x="4" y="112" width="3" height="20" fill="#FFD600" />
                <rect x="55" y="105" width="13" height="34" rx="3" fill="#141414" />
                <rect x="63" y="112" width="3" height="20" fill="#FFD600" />
                {/* Suspension Arms */}
                <line x1="14" y1="120" x2="26" y2="120" stroke="#757575" strokeWidth="2" />
                <line x1="44" y1="120" x2="56" y2="120" stroke="#757575" strokeWidth="2" />
                {/* Main Chassis / Sidepods (Ferrari Red) */}
                <path
                  d="M 27 25 Q 35 15 43 25 L 45 65 Q 52 75 50 115 L 42 130 L 28 130 L 20 115 Q 18 75 25 65 Z"
                  fill="#D32F2F"
                  stroke="#B71C1C"
                  strokeWidth="1.5"
                />
                {/* Cockpit Halo & Driver Helmet */}
                <ellipse cx="35" cy="74" rx="7" ry="12" fill="#0A0A0A" />
                <circle cx="35" cy="72" r="5" fill="#FAFAFA" />
                <path d="M 30 68 Q 35 60 40 68" stroke="#111" strokeWidth="3" fill="none" />
                {/* Front Suspension */}
                <line x1="14" y1="42" x2="27" y2="44" stroke="#757575" strokeWidth="2" />
                <line x1="43" y1="44" x2="56" y2="42" stroke="#757575" strokeWidth="2" />
                {/* Front Wheels */}
                <rect x="3" y="28" width="12" height="30" rx="3" fill="#141414" />
                <rect x="5" y="34" width="3" height="18" fill="#FFD600" />
                <rect x="55" y="28" width="12" height="30" rx="3" fill="#141414" />
                <rect x="62" y="34" width="3" height="18" fill="#FFD600" />
                {/* Front Nose & Wing */}
                <path d="M 31 25 L 35 6 L 39 25 Z" fill="#C62828" />
                <rect x="8" y="4" width="54" height="8" rx="2" fill="#1A1A1A" stroke="#E53935" strokeWidth="1" />
                <rect x="29" y="16" width="12" height="7" rx="1" fill="#FFEB3B" />
              </svg>
            </div>

            {/* -------------------------------------------------------------
                CAR 3: PURSUER (SCUDERIA FERRARI · SAI #55)
                ------------------------------------------------------------- */}
            <div
              className="f1-car-entity car-p3"
              style={{
                left: `${carPositions.sai.x}px`,
                top: `${carPositions.sai.y}px`,
                transform: `translate(-50%, -50%) rotate(${carPositions.sai.angle}deg)`,
                zIndex: 6,
              }}
            >
              <div className="floating-car-label p3-label">
                <span className="lbl-pos">P3</span>
                <span className="lbl-code">SAI #55</span>
                <span className="lbl-spd">+1.21s</span>
              </div>

              {/* Ferrari F1 Car SVG */}
              <svg className="f1-car-svg" viewBox="0 0 70 160" width="46" height="106">
                <rect x="12" y="132" width="46" height="12" rx="2" fill="#1C1C1C" stroke="#B71C1C" strokeWidth="1.5" />
                <rect x="22" y="142" width="26" height="4" fill="#C62828" />
                <rect x="2" y="105" width="13" height="34" rx="3" fill="#141414" />
                <rect x="4" y="112" width="3" height="20" fill="#FFD600" />
                <rect x="55" y="105" width="13" height="34" rx="3" fill="#141414" />
                <rect x="63" y="112" width="3" height="20" fill="#FFD600" />
                <line x1="14" y1="120" x2="26" y2="120" stroke="#757575" strokeWidth="2" />
                <line x1="44" y1="120" x2="56" y2="120" stroke="#757575" strokeWidth="2" />
                <path
                  d="M 27 25 Q 35 15 43 25 L 45 65 Q 52 75 50 115 L 42 130 L 28 130 L 20 115 Q 18 75 25 65 Z"
                  fill="#C62828"
                  stroke="#8E0000"
                  strokeWidth="1.5"
                />
                <ellipse cx="35" cy="74" rx="7" ry="12" fill="#0A0A0A" />
                <circle cx="35" cy="72" r="5" fill="#FFD600" />
                <path d="M 30 68 Q 35 60 40 68" stroke="#111" strokeWidth="3" fill="none" />
                <line x1="14" y1="42" x2="27" y2="44" stroke="#757575" strokeWidth="2" />
                <line x1="43" y1="44" x2="56" y2="42" stroke="#757575" strokeWidth="2" />
                <rect x="3" y="28" width="12" height="30" rx="3" fill="#141414" />
                <rect x="5" y="34" width="3" height="18" fill="#FFD600" />
                <rect x="55" y="28" width="12" height="30" rx="3" fill="#141414" />
                <rect x="62" y="34" width="3" height="18" fill="#FFD600" />
                <path d="M 31 25 L 35 6 L 39 25 Z" fill="#B71C1C" />
                <rect x="8" y="4" width="54" height="8" rx="2" fill="#1A1A1A" stroke="#C62828" strokeWidth="1" />
                <rect x="29" y="16" width="12" height="7" rx="1" fill="#FFEB3B" />
              </svg>
            </div>

            {/* -------------------------------------------------------------
                CAR 4: PURSUER (MERCEDES-AMG PETRONAS · RUS #63)
                ------------------------------------------------------------- */}
            <div
              className="f1-car-entity car-p4"
              style={{
                left: `${carPositions.rus.x}px`,
                top: `${carPositions.rus.y}px`,
                transform: `translate(-50%, -50%) rotate(${carPositions.rus.angle}deg)`,
                zIndex: 4,
              }}
            >
              <div className="floating-car-label p4-label">
                <span className="lbl-pos">P4</span>
                <span className="lbl-code">RUS #63</span>
                <span className="lbl-spd">+4.16s</span>
              </div>

              {/* Mercedes F1 Car SVG */}
              <svg className="f1-car-svg" viewBox="0 0 70 160" width="46" height="106">
                <rect x="12" y="132" width="46" height="12" rx="2" fill="#12181B" stroke="#00D2BE" strokeWidth="1.5" />
                <rect x="22" y="142" width="26" height="4" fill="#00D2BE" />
                <rect x="2" y="105" width="13" height="34" rx="3" fill="#111111" />
                <rect x="4" y="112" width="3" height="20" fill="#00D2BE" />
                <rect x="55" y="105" width="13" height="34" rx="3" fill="#111111" />
                <rect x="63" y="112" width="3" height="20" fill="#00D2BE" />
                <line x1="14" y1="120" x2="26" y2="120" stroke="#607D8B" strokeWidth="2" />
                <line x1="44" y1="120" x2="56" y2="120" stroke="#607D8B" strokeWidth="2" />
                <path
                  d="M 27 25 Q 35 15 43 25 L 45 65 Q 52 75 50 115 L 42 130 L 28 130 L 20 115 Q 18 75 25 65 Z"
                  fill="#1A2329"
                  stroke="#00D2BE"
                  strokeWidth="1.5"
                />
                <path d="M 24 75 L 46 75" stroke="#00D2BE" strokeWidth="2.5" />
                <ellipse cx="35" cy="74" rx="7" ry="12" fill="#080C0E" />
                <circle cx="35" cy="72" r="5" fill="#E0E0E0" />
                <path d="M 30 68 Q 35 60 40 68" stroke="#00D2BE" strokeWidth="3" fill="none" />
                <line x1="14" y1="42" x2="27" y2="44" stroke="#607D8B" strokeWidth="2" />
                <line x1="43" y1="44" x2="56" y2="42" stroke="#607D8B" strokeWidth="2" />
                <rect x="3" y="28" width="12" height="30" rx="3" fill="#111111" />
                <rect x="5" y="34" width="3" height="18" fill="#00D2BE" />
                <rect x="55" y="28" width="12" height="30" rx="3" fill="#111111" />
                <rect x="62" y="34" width="3" height="18" fill="#00D2BE" />
                <path d="M 31 25 L 35 6 L 39 25 Z" fill="#00D2BE" />
                <rect x="8" y="4" width="54" height="8" rx="2" fill="#0E1719" stroke="#00D2BE" strokeWidth="1" />
                <rect x="29" y="16" width="12" height="7" rx="1" fill="#00D2BE" />
              </svg>
            </div>
          </>
        )}

        {/* -------------------------------------------------------------
            3. AUTHENTIC MONZA CIRCUIT VECTOR MINIMAP (TOP-RIGHT HUD)
            ------------------------------------------------------------- */}
        <div className="monza-minimap-hud">
          <div className="minimap-header">
            <span className="circuit-name">AUTODROMO MONZA</span>
            <span className="circuit-len">5.793 KM</span>
          </div>

          <svg className="monza-circuit-svg" viewBox="0 0 160 110">
            {/* Sector 1: Rettifilo straight down to Curva Grande */}
            <path
              d="M 28 88 L 138 88 Q 148 88 148 76 L 148 38 Q 148 24 134 22 L 95 22 Q 88 22 84 28 L 74 44 Q 68 52 58 52 L 40 52 Q 28 52 28 66 Z"
              fill="none"
              stroke="#243447"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Active Racing Line glow */}
            <path
              d="M 28 88 L 138 88 Q 148 88 148 76 L 148 38 Q 148 24 134 22 L 95 22 Q 88 22 84 28 L 74 44 Q 68 52 58 52 L 40 52 Q 28 52 28 66 Z"
              fill="none"
              stroke="#00E5FF"
              strokeWidth="2"
              strokeDasharray="4 3"
            />

            {/* Turn Labels */}
            <text x="80" y="98" fill="#94A3B8" fontSize="6" fontFamily="Space Mono">T1 RETTIFILO</text>
            <text x="110" y="18" fill="#94A3B8" fontSize="6" fontFamily="Space Mono">T7 LESMO</text>
            <text x="18" y="44" fill="#94A3B8" fontSize="6" fontFamily="Space Mono">T11 PARABOLICA</text>

            {/* Car 1: LEC Blip (Red) */}
            <circle cx="86" cy="88" r="4" fill="#E53935" stroke="#FFFFFF" strokeWidth="1" />
            {/* Car 2: VER Blip (Cyan) */}
            <circle cx="78" cy="88" r="4.5" fill="#00E5FF" stroke="#FFFFFF" strokeWidth="1.2" />
          </svg>

          <div className="minimap-sectors">
            <span className="sec-chip s1">S1 27.8s</span>
            <span className="sec-chip s2">S2 26.9s</span>
            <span className="sec-chip s3">S3 25.4s</span>
          </div>
        </div>

        {/* -------------------------------------------------------------
            4. BROADCAST HUD OVERLAYS
            ------------------------------------------------------------- */}
        <div className="battle-telemetry-hud-overlay">
          <div className="hud-center-battle-badge">
            <div className="battle-badge-left">
              <span className="bb-tag">DELTA TO RIVAL</span>
              <span className="bb-val highlight-gold">+{gapAhead.toFixed(3)}s</span>
            </div>
            <div className="bb-divider" />
            <div className="battle-badge-right">
              <span className="bb-tag">CLOSING SPEED</span>
              <span className="bb-val highlight-green">+{closingSpeed.toFixed(1)} KM/H</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
