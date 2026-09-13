import React from 'react'

/**
 * BottomTelemetryBar — Unified Telemetry, Driver Comms & Race Timeline Strip
 *
 * Implements Sections 13, 14, 15:
 * Row 1: SPEED 312 km/h │ THROTTLE 98% │ BRAKE 0% │ ERS 67% │ TYRE MEDIUM │ DELTA -0.214s │ LAP 30 / 50
 * Row 2: DRIVER COMMS: AI → DRIVER "Attack window opening..."  ✓ DELIVERED  │  RACE TIMELINE
 */
export default function BottomTelemetryBar({
  decision,
  radioMessage,
  driverAudioState,
  lap = 30,
  totalLaps = 50,
}) {
  const speed = Math.round(Number(decision?.speed_kph ?? 312))
  const soc = Math.round(Number(decision?.soc ?? 0.67) * 100)
  const tyreCompound = decision?.tyre_compound ?? 'MEDIUM'
  const delta = Number(decision?.sector_delta_s ?? -0.214)
  const deltaFormatted = delta > 0 ? `+${delta.toFixed(3)}s` : `${delta.toFixed(3)}s`
  const currentLap = decision?.lap ?? lap

  const throttle = speed > 260 ? Math.min(100, Math.max(85, Math.round(92 + (speed % 7)))) : 65
  const brake = throttle > 75 ? 0 : Math.round(100 - throttle)

  // Section 14: Real Driver Comms Message & Delivery Status
  const activeMsgText = radioMessage?.call || 'Attack window opening. DRS available. Deploy ERS at T1.'
  let commsStatus = 'DELIVERED'
  let commsStatusClass = 'delivered'

  if (driverAudioState?.lastAck) {
    commsStatus = `ACKNOWLEDGED ("${driverAudioState.lastAck.reply || 'COPY'}")`
    commsStatusClass = 'acknowledged'
  } else if (driverAudioState?.connected) {
    commsStatus = 'DELIVERED ✓'
    commsStatusClass = 'delivered'
  } else {
    commsStatus = 'SENT ✓'
    commsStatusClass = 'sent'
  }

  // Section 15: Race Strategy Timeline around current lap
  const timelineLaps = [
    { lap: currentLap - 3, strat: 'HOLD', status: 'completed' },
    { lap: currentLap - 2, strat: 'HARVEST', status: 'completed' },
    { lap: currentLap - 1, strat: 'ATTACK WINDOW', status: 'completed' },
    { lap: currentLap, strat: 'ATTACK', status: 'current' },
    { lap: currentLap + 1, strat: 'PENDING', status: 'future' },
  ]

  return (
    <footer className="unified-bottom-console">
      {/* ROW 1: HORIZONTAL TELEMETRY STRIP (Section 13) */}
      <div className="bottom-telemetry-strip">
        <div className="telem-item">
          <span className="telem-k">SPEED</span>
          <span className="telem-v highlight-white">{speed} <small>km/h</small></span>
        </div>

        <span className="telem-sep">│</span>

        <div className="telem-item">
          <span className="telem-k">THROTTLE</span>
          <span className="telem-v highlight-green">{throttle}%</span>
        </div>

        <span className="telem-sep">│</span>

        <div className="telem-item">
          <span className="telem-k">BRAKE</span>
          <span className="telem-v highlight-amber">{brake}%</span>
        </div>

        <span className="telem-sep">│</span>

        <div className="telem-item">
          <span className="telem-k">ERS</span>
          <span className="telem-v highlight-cyan">{soc}%</span>
        </div>

        <span className="telem-sep">│</span>

        <div className="telem-item">
          <span className="telem-k">TYRE</span>
          <span className="telem-v highlight-gold">
            <span className="tyre-pip med" />
            {tyreCompound}
          </span>
        </div>

        <span className="telem-sep">│</span>

        <div className="telem-item">
          <span className="telem-k">DELTA</span>
          <span className={`telem-v ${delta <= 0 ? 'highlight-green' : 'warning-text'}`}>
            {deltaFormatted}
          </span>
        </div>

        <span className="telem-sep">│</span>

        <div className="telem-item">
          <span className="telem-k">LAP</span>
          <span className="telem-v highlight-white">{currentLap} / {totalLaps}</span>
        </div>
      </div>

      {/* ROW 2: DRIVER COMMS + RACE TIMELINE (Sections 14 & 15) */}
      <div className="bottom-comms-timeline-strip">
        {/* DRIVER COMMS (AI → DRIVER) */}
        <div className="driver-comms-block">
          <div className="comms-header-tag">
            <span className="radio-wave-pip" />
            <span className="comms-role-text">DRIVER COMMS: AI → DRIVER</span>
          </div>
          <div className="comms-message-text" title={activeMsgText}>
            "{activeMsgText}"
          </div>
          <div className={`comms-delivery-badge ${commsStatusClass}`}>
            <span className="badge-tick">✓</span>
            <span className="badge-lbl">{commsStatus}</span>
          </div>
        </div>

        <span className="strip-vert-divider" />

        {/* RACE STRATEGY TIMELINE */}
        <div className="race-strategy-timeline-block">
          <span className="timeline-block-title">TIMELINE:</span>
          <div className="timeline-laps-group">
            {timelineLaps.map((item) => (
              <div key={item.lap} className={`mini-timeline-node ${item.status}`}>
                <span className="node-lap">LAP {item.lap}</span>
                <span className="node-strat">{item.strat}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
