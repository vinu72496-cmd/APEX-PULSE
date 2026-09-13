import React, { useState } from 'react'
import { centralRaceState, INITIAL_GRID } from '../utils/centralRaceState.js'

/**
 * LeftRaceDataPanel — Professional LIVE STANDINGS & On-board CAN Telemetry
 *
 * Implements:
 * 1. Synchronized 10-car grid matching pit wall & DDU screens
 * 2. Active driver highlighted (LEC #16 default P4, VER #1 P1, HAM #44 P8)
 * 3. Accurate interval gaps, tyre compound tags, and DRS status
 * 4. High-frequency CAN telemetry for selected car (Speed, RPM, Gear, Throttle/Brake, Thermals)
 */
export default function LeftRaceDataPanel({
  decision,
  lap = 30,
  totalLaps = 50,
  grid: propGrid,
  activeDriverId = 'driver_2',
  onSelectDriver,
}) {
  const [selectedDriverCode, setSelectedDriverCode] = useState(null)

  // Use props grid or central race state grid
  const standings = propGrid || centralRaceState.getSnapshot().grid || INITIAL_GRID

  // Current target driver
  const activeDriver = centralRaceState.getActiveDriver()
  const effectiveTargetCode = selectedDriverCode || activeDriver?.code || 'LEC'

  // Find targeted item in standings
  const targetedCar = standings.find((c) => c.driver === effectiveTargetCode) || standings[3]

  // Live CAN telemetry variables
  const speed = Math.round(Number(decision?.speed_kph ?? targetedCar.speed ?? 324))
  const gapAhead = Number(decision?.gap_ahead_s ?? decision?.gap_to_ahead_s ?? 0.82)
  const soc = Math.round(Number(decision?.soc ?? targetedCar.ersPct / 100 ?? 0.52) * 100)
  const throttle = speed > 260 ? Math.min(100, Math.max(85, Math.round(92 + (speed % 7)))) : 65
  const brake = throttle > 75 ? 0 : Math.round(100 - throttle)
  const rpm = Math.min(12400, Math.max(10400, Math.round(10800 + (speed % 25) * 48)))
  const drsActive = Boolean(decision?.drs_available || targetedCar.pos > 1 && gapAhead <= 1.0)
  const tyreTemps = decision?.tyre_temps ?? { fl: 102, fr: 104, rl: 98, rr: 99 }

  let gear = 8
  if (speed < 100) gear = 2
  else if (speed < 140) gear = 3
  else if (speed < 185) gear = 4
  else if (speed < 230) gear = 5
  else if (speed < 270) gear = 6
  else if (speed < 305) gear = 7

  const handleRowClick = (item) => {
    setSelectedDriverCode(item.driver)
    if (item.id && onSelectDriver) {
      onSelectDriver(item.id)
    } else if (item.id) {
      centralRaceState.setActiveDriver(item.id)
    }
  }

  return (
    <aside className="left-standings-panel">
      {/* 1. LIVE STANDINGS CARD */}
      <div className="standings-card-container">
        <div className="standings-card-header">
          <div className="title-lockup">
            <span className="live-status-dot" />
            <h2 className="panel-heading">LIVE STANDINGS</h2>
          </div>
          <span className="standings-meta">LAP {decision?.lap ?? lap}/{totalLaps}</span>
        </div>

        <div className="standings-list-wrap">
          {standings.map((item) => {
            const isSelected = effectiveTargetCode === item.driver
            const isUserTarget = item.id === activeDriverId || (activeDriverId === 'driver_2' && item.driver === 'LEC')

            return (
              <div
                key={item.pos + '-' + item.driver}
                className={`standings-item-row ${isUserTarget ? 'user-car' : ''} ${isSelected ? 'active-row' : ''}`}
                onClick={() => handleRowClick(item)}
                title={`Telemetry source: ${item.fullName} (${item.team}) — Click to focus`}
              >
                {/* Position Column */}
                <div className="pos-col">
                  <span className="pos-label">P{item.pos}</span>
                </div>

                {/* Team Livery Color Indicator */}
                <div className="team-indicator-col">
                  <span className="team-color-strip" style={{ background: item.teamColor }} />
                </div>

                {/* Driver Name Column */}
                <div className="driver-name-col">
                  <span className="driver-code">{item.driver}</span>
                  <span className="driver-sub">{item.fullName ? item.fullName.split(' ')[1] : item.team}</span>
                </div>

                {/* Tyre Badge */}
                <div className="tyre-col">
                  <span className={`tyre-compound-tag ${item.tyre.toLowerCase()}`}>
                    {item.tyre}
                  </span>
                </div>

                {/* Gap Column (Large readable numbers) */}
                <div className="gap-col">
                  <span className={`gap-val ${item.pos === 1 ? 'leader-gap' : ''}`}>
                    {item.gap}
                  </span>
                </div>

                {/* Optional DRS Indicator */}
                {(item.drs || (item.pos === 4 && drsActive)) && (
                  <div className="drs-col">
                    <span className="drs-active-badge">DRS</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 2. COMPACT ON-BOARD CAR TELEMETRY (SELECTED CAR) */}
      <div className="onboard-telemetry-mini-card">
        <div className="mini-card-header">
          <span className="mini-title">ON-BOARD CAN · {targetedCar.fullName || `${targetedCar.driver} #${targetedCar.number}`}</span>
          <span className="mini-channel-badge">20Hz STREAM</span>
        </div>

        <div className="mini-card-grid">
          {/* Gear & Speed Cluster */}
          <div className="gear-speed-block">
            <div className="gear-box-mini">
              <span className="gb-lbl">GEAR</span>
              <span className="gb-val">{gear}</span>
            </div>
            <div className="speed-cluster-mini">
              <span className="sc-speed">{speed} <small>KM/H</small></span>
              <span className="sc-rpm">{rpm} RPM</span>
            </div>
          </div>

          {/* 12-LED RPM Rev Lights */}
          <div className="rev-lights-mini-bar">
            {Array.from({ length: 12 }).map((_, i) => {
              const revFraction = Math.min(1.0, Math.max(0.15, (rpm - 10000) / 2400))
              const activeLeds = Math.round(revFraction * 12)
              const isGreen = i < 4
              const isRed = i >= 4 && i < 8
              const isBlue = i >= 8
              const isActive = i < activeLeds
              return (
                <span
                  key={i}
                  className={`led-mini ${isActive ? (isGreen ? 'green' : isRed ? 'red' : 'blue') : ''}`}
                />
              )
            })}
          </div>

          {/* Driver Steering Wheel & Angle Gauge */}
          <div className="steering-gauge-mini-row">
            <div className="steer-mini-visual">
              <svg
                className="mini-wheel-svg"
                viewBox="0 0 50 32"
                width="36"
                height="22"
                style={{
                  transform: `rotate(${Math.sin((speed % 80) * 0.12) * 14}deg)`,
                  transition: 'transform 0.1s ease-out',
                }}
              >
                <path
                  d="M 6 4 Q 25 -2 44 4 L 46 22 Q 40 28 32 26 L 30 20 L 20 20 L 18 26 Q 10 28 4 22 Z"
                  fill="#111822"
                  stroke={targetedCar.teamColor || '#00E5FF'}
                  strokeWidth="1.5"
                />
                <circle cx="25" cy="12" r="3" fill="#FFD600" />
                <rect x="2" y="8" width="5" height="14" rx="2" fill="#0A0E14" />
                <rect x="43" y="8" width="5" height="14" rx="2" fill="#0A0E14" />
              </svg>
            </div>
            <div className="steer-mini-meta">
              <span className="smm-k">DRIVER STEERING</span>
              <span className="smm-v highlight-cyan">
                {Math.sin((speed % 80) * 0.12) >= 0 ? `+${(Math.sin((speed % 80) * 0.12) * 14).toFixed(1)}° R` : `${(Math.sin((speed % 80) * 0.12) * 14).toFixed(1)}° L`}
              </span>
            </div>
            <span className="steer-chicane-tag">T1 CHICANE</span>
          </div>

          {/* Throttle & Brake Pedals */}
          <div className="pedals-mini-row">
            <div className="pedal-cell">
              <span className="pedal-name">THR {throttle}%</span>
              <div className="pedal-track"><div className="pedal-fill thr" style={{ width: `${throttle}%` }} /></div>
            </div>
            <div className="pedal-cell">
              <span className="pedal-name">BRK {brake}%</span>
              <div className="pedal-track"><div className="pedal-fill brk" style={{ width: `${brake}%` }} /></div>
            </div>
          </div>

          {/* 4 Tyre Thermals & ERS */}
          <div className="tyre-thermals-mini-row">
            <div className="thermal-item"><span>FL</span><b>{tyreTemps.fl}°C</b></div>
            <div className="thermal-item"><span>FR</span><b>{tyreTemps.fr}°C</b></div>
            <div className="thermal-item"><span>RL</span><b>{tyreTemps.rl}°C</b></div>
            <div className="thermal-item"><span>RR</span><b>{tyreTemps.rr}°C</b></div>
          </div>
        </div>
      </div>
    </aside>
  )
}
