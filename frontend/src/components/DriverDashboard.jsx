import React, { useState, useEffect } from 'react'
import { speakRadioMessage, speakDriverAck, getDriverResponseForAction, playRadioBeep, playRadioEndBeep, playDriverAckBeep } from '../utils/radioAudio.js'
import DriverCallModal from './DriverCallModal.jsx'
import { driverCallManager } from '../utils/webrtcCallManager.js'
import { centralRaceState } from '../utils/centralRaceState.js'
import { getApiUrl } from '../config.js'

/**
 * DriverDashboard — Formula 1 Driver Cockpit & MoTeC Telemetry Command Station
 *
 * Implements:
 * 1. Graphical Driver Model: F1 driver in the cockpit wearing Red Bull helmet & racing gloves,
 *    holding the steering wheel as it dynamically rotates into the corners.
 * 2. Forward Visor Horizon: Looking through the titanium Halo pillar onto the Monza circuit.
 * 3. Integrated MoTeC PCU-8D Instrument Cluster: 15-LED sequential shift array, 80px gear,
 *    speed, lap delta, ERS battery, tyre carcass thermals, and throttle/brake pedals.
 * 4. Pit Wall Radio Communications: Interactive Push-to-Talk with verified audio acknowledgment.
 */
export default function DriverDashboard({
  decision,
  connected = true,
  radioMessage,
  onAcknowledgeRadio,
}) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [userSteerOffset, setUserSteerOffset] = useState(0)
  const [callState, setCallState] = useState({ status: 'IDLE', durationFormatted: '00:00', isMuted: false })

  useEffect(() => {
    const unsub = driverCallManager.subscribe((state) => {
      setCallState(state)
    })
    return () => unsub()
  }, [])
  const [driverViewMode, setDriverViewMode] = useState('ONBOARD_POV') // 'ONBOARD_POV' | 'COCKPIT_WHEEL' | 'STEER_SIM'

  // 1. GEAR & SPEED
  const speed = Math.round(Number(decision?.speed_kmh ?? decision?.speed_kph ?? 312))
  let gear = Number(decision?.gear ?? 7)
  if (!decision?.gear) {
    if (speed < 100) gear = 2
    else if (speed < 140) gear = 3
    else if (speed < 185) gear = 4
    else if (speed < 230) gear = 5
    else if (speed < 270) gear = 6
    else if (speed < 305) gear = 7
    else gear = 8
  }

  // 2. RPM & 15-LED REV BAR
  const rpm = Math.round(Number(decision?.rpm ?? (10200 + (speed % 40) * 35)))
  const revPips = 15
  const rpmRatio = Math.min(1, Math.max(0, (rpm - 9200) / 2800))
  const activePips = Math.round(rpmRatio * revPips)
  const isShiftPoint = activePips >= 14

  // 3. LAP & POSITION (Synchronized with central race state)
  const activeDriver = centralRaceState.getActiveDriver()
  const lap = decision?.lap ?? activeDriver?.lap ?? 30
  const totalLaps = 50
  const position = activeDriver?.posNum ?? Number(decision?.position ?? 4)

  // 4. GAP TO CAR AHEAD
  const gapAhead = Number(decision?.gap_ahead_s ?? decision?.gap_to_ahead_s ?? activeDriver?.gap_ahead_s ?? 0.82)
  const isGapCritical = gapAhead < 0.65
  const rivalDriver = activeDriver?.car_ahead ?? decision?.car_ahead ?? 'PIA #81'

  // 5. LIVE PACE DELTA
  const delta = Number(decision?.sector_delta_s ?? (activeDriver?.pace_delta ? parseFloat(activeDriver.pace_delta) : -0.21))
  const isDeltaPositive = delta <= 0

  // 6. DRS STATUS
  const drsAvailable = Boolean(decision?.drs_available || gapAhead <= 1.0)
  const drsActive = Boolean(decision?.drs_active || (drsAvailable && speed > 260))

  // 7. HYBRID BATTERY & ERS MODE
  const socVal = Number(decision?.soc ?? activeDriver?.soc ?? 0.52)
  const socPct = Math.round(socVal * 100)
  const mode = decision?.mode ?? (drsActive ? 'OVERTAKE' : 'PUSH')
  const mguKw = Math.round(Number(decision?.mguk_power_kw ?? (mode === 'OVERTAKE' ? 120 : (mode === 'PUSH' ? 100 : (mode === 'HARVEST' ? -60 : 60)))))

  // 8. PIT STRATEGY DIRECTIVE ACTION CALLOUT
  const prob = Math.round(Number(decision?.overtake_probability ?? decision?.probability ?? (decision?.overtake_confidence ? decision.overtake_confidence * 100 : 82)))
  const rawAction = decision?.action ?? (prob >= 65 ? 'OVERTAKE NOW' : (prob >= 40 ? 'HOLD POSITION' : 'ABORT PASS'))
  let actionType = 'overtake'
  let actionText = 'OVERTAKE NOW'
  let actionIcon = 'MODE 4'
  if (rawAction.includes('OVERTAKE') || rawAction.includes('ATTACK')) {
    actionType = 'overtake'
    actionText = 'OVERTAKE NOW'
    actionIcon = 'MODE 4'
  } else if (rawAction.includes('DEFEND')) {
    actionType = 'defend'
    actionText = 'DEFEND APEX'
    actionIcon = 'DEF'
  } else if (rawAction.includes('HOLD') || rawAction.includes('WAIT')) {
    actionType = 'hold'
    actionText = 'HOLD POSITION'
    actionIcon = 'HOLD'
  } else {
    actionType = 'abort'
    actionText = 'ABORT / HARVEST'
    actionIcon = 'REGEN'
  }

  // 9. TYRES & TEMPERATURES
  const tyreLife = Math.round(Number(decision?.tyre_life_pct ?? activeDriver?.tyre_life_pct ?? 82))
  const tyreCompound = decision?.tyre_compound ?? activeDriver?.tyre_compound ?? 'HARD'
  const temps = decision?.tyre_temps ?? { fl: 102, fr: 104, rl: 98, rr: 99 }

  // 10. PEDALS & SECTORS
  const throttle = speed > 260 ? Math.min(100, Math.max(88, Math.round(92 + (speed % 7)))) : 72
  const brake = throttle > 80 ? 0 : Math.round(100 - throttle)

  // 11. PIT WALL RADIO
  const radioText = radioMessage?.transcript ?? decision?.radio_message?.transcript ?? (drsAvailable ? `Attack ${rivalDriver} on brakes into Turn 1` : "Hold gap. Recharging battery for DRS zone.")

  // Dynamic Steering Angle (Smooth cornering oscillation)
  const [autoSteerAngle, setAutoSteerAngle] = useState(0)
  useEffect(() => {
    let anim
    let t = 0
    const updateSteer = () => {
      t += 0.03
      const baseWave = Math.sin(t * 1.8) * 12
      const chicaneFlick = Math.sin(t * 3.6) * 5
      setAutoSteerAngle(baseWave + chicaneFlick)
      anim = requestAnimationFrame(updateSteer)
    }
    anim = requestAnimationFrame(updateSteer)
    return () => cancelAnimationFrame(anim)
  }, [])

  const currentSteerAngle = Number((autoSteerAngle + userSteerOffset).toFixed(1))

  // Driver Message Acceptance State Machine (Driver-side Acceptance Feature)
  const [driverMessageState, setDriverMessageState] = useState({
    id: null,
    status: 'IDLE', // 'IDLE' | 'PENDING' | 'ACCEPTED' | 'DECLINED'
    replyText: '',
  })

  // Watch for incoming radioMessage from pit wall coach and synthesize voice aloud in cockpit
  useEffect(() => {
    if (radioMessage && radioMessage.id) {
      const isAlreadyAcked =
        radioMessage.status === 'ACKNOWLEDGED' || radioMessage.status === 'ACCEPTED'
      const isAlreadyDeclined = radioMessage.status === 'DECLINED'

      if (isAlreadyAcked) {
        setDriverMessageState({
          id: radioMessage.id,
          status: 'ACCEPTED',
          replyText: radioMessage.driver_reply || 'COPY THAT / EXECUTING',
        })
        setAcknowledged(true)
      } else if (isAlreadyDeclined) {
        setDriverMessageState({
          id: radioMessage.id,
          status: 'DECLINED',
          replyText: radioMessage.driver_reply || 'UNABLE TO COMPLY',
        })
      } else if (radioMessage.id !== driverMessageState.id) {
        setDriverMessageState({
          id: radioMessage.id,
          status: 'PENDING',
          replyText: '',
        })
        setAcknowledged(false)
        playRadioBeep()
        const textToSpeak =
          radioMessage.transcript || radioMessage.speech || radioMessage.call || radioMessage.coachMessage || radioMessage.message
        if (textToSpeak) {
          speakRadioMessage(textToSpeak, true)
        }

        // Send instant delivery confirmation to pit wall coach
        fetch(getApiUrl('/api/command/delivered'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: radioMessage.id }),
        }).catch(() => {})
      }
    }
  }, [radioMessage?.id, radioMessage?.status, radioMessage?.driver_reply])

  const handleAcceptDirective = () => {
    playDriverAckBeep()
    const now = new Date()
    const timeStr = now.toTimeString().split(' ')[0]
    const reply = getDriverResponseForAction(radioMessage?.action || decision?.mode || 'OVERTAKE')
    speakDriverAck(reply, true)
    setAcknowledged(true)

    setDriverMessageState((prev) => ({
      ...prev,
      status: 'ACCEPTED',
      replyText: reply,
    }))

    if (onAcknowledgeRadio) {
      onAcknowledgeRadio({
        id: radioMessage?.id,
        action: radioMessage?.action || 'DIRECTIVE',
        reply: reply,
        time: timeStr,
        lap: lap,
        status: 'ACKNOWLEDGED',
      })
    }

    fetch(getApiUrl('/api/command/ack'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: radioMessage?.id,
        action: radioMessage?.action || 'DIRECTIVE',
        reply: reply,
        status: 'ACKNOWLEDGED',
        time: timeStr,
      }),
    }).catch(() => {})
  }

  const handleDeclineDirective = () => {
    playRadioEndBeep()
    const now = new Date()
    const timeStr = now.toTimeString().split(' ')[0]
    const declineReply = 'NEGATIVE / UNABLE TO COMPLY · DEFENDING APEX'
    speakDriverAck(declineReply, true)

    setDriverMessageState((prev) => ({
      ...prev,
      status: 'DECLINED',
      replyText: declineReply,
    }))

    if (onAcknowledgeRadio) {
      onAcknowledgeRadio({
        id: radioMessage?.id,
        action: radioMessage?.action || 'DIRECTIVE',
        reply: declineReply,
        time: timeStr,
        lap: lap,
        status: 'DECLINED',
      })
    }

    fetch(getApiUrl('/api/command/ack'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: radioMessage?.id,
        action: 'DECLINED',
        reply: declineReply,
        status: 'DECLINED',
        time: timeStr,
      }),
    }).catch(() => {})
  }

  const handleCopyRadio = () => {
    if (driverMessageState.status === 'PENDING') {
      handleAcceptDirective()
    } else {
      playDriverAckBeep()
      const now = new Date()
      const timeStr = now.toTimeString().split(' ')[0]
      const reply = '5 BY 5 - AUDIO LOUD & CLEAR · COPY PIT WALL'
      speakDriverAck(reply, true)
      setAcknowledged(true)

      if (onAcknowledgeRadio) {
        onAcknowledgeRadio({
          id: Date.now(),
          action: 'RADIO_CHECK',
          reply: reply,
          time: timeStr,
          lap: lap,
          status: 'ACCEPTED',
        })
      }

      fetch(getApiUrl('/api/radio/ack'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RADIO_CHECK',
          reply: reply,
          status: 'ACKNOWLEDGED',
          time: timeStr,
        }),
      }).catch(() => {})
    }
  }

  return (
    <div className="driver-dashboard-dual-station">
      {/* Live Team Radio Direct Call Modal is managed at top-level App root to prevent duplicates */}

      {/* Subtle formula racing car watermark background */}
      <div className="driver-dashboard-bg-watermark" aria-hidden="true" />

      {/* =========================================================================
          COCKPIT LIVE VOICE CALL INTERCOM ACCEPTANCE & HUD (Driver-Side Feature)
          ========================================================================= */}
      {(callState.status === 'RINGING' || callState.status === 'CALLING') && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(234, 179, 8, 0.35), rgba(15, 23, 42, 0.98))',
          border: '2px solid #EAB308',
          boxShadow: '0 0 30px rgba(234, 179, 8, 0.6), inset 0 0 15px rgba(234, 179, 8, 0.2)',
          borderRadius: '10px',
          padding: '16px 20px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          fontFamily: "'Space Mono', monospace",
          zIndex: 50
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: '#EAB308',
              color: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              fontWeight: '900',
              boxShadow: '0 0 15px #EAB308'
            }}>
              ☎
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: '900', color: '#F8FAFC', letterSpacing: '1px' }}>
                  PIT WALL COACH
                </span>
                <span style={{
                  background: 'rgba(234, 179, 8, 0.25)',
                  border: '1px solid #EAB308',
                  borderRadius: '12px',
                  padding: '2px 10px',
                  fontSize: '10px',
                  fontWeight: '900',
                  color: '#FDE047'
                }}>
                  ● INCOMING VOICE CALL
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#FEF08A', marginTop: '3px' }}>
                Coach is calling cockpit intercom. Accept call to establish live race radio headset reception.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', minWidth: '270px' }}>
            <button
              onClick={() => driverCallManager.acceptCall(callState.callId)}
              style={{
                flex: 1.4,
                background: 'linear-gradient(90deg, #22C55E, #16A34A)',
                border: '1px solid #4ADE80',
                borderRadius: '8px',
                padding: '12px 16px',
                color: '#000',
                fontWeight: '900',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 0 16px rgba(34, 197, 94, 0.5)',
                letterSpacing: '0.5px'
              }}
              title="Accept Call from Coach and Connect Helmet Headset"
            >
              <span>✓</span> ACCEPT CALL
            </button>

            <button
              onClick={() => driverCallManager.declineCall(callState.callId)}
              style={{
                flex: 1,
                background: 'rgba(239, 68, 68, 0.25)',
                border: '1px solid #EF4444',
                borderRadius: '8px',
                padding: '12px 14px',
                color: '#EF4444',
                fontWeight: '800',
                fontSize: '12px',
                cursor: 'pointer'
              }}
              title="Decline Voice Call"
            >
              ✕ DECLINE CALL
            </button>
          </div>
        </div>
      )}

      {/* CONNECTED STATE COCKPIT INTERCOM HUD */}
      {callState.status === 'CONNECTED' && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(6, 78, 59, 0.45), rgba(15, 23, 42, 0.98))',
          border: '2px solid #22C55E',
          boxShadow: '0 0 25px rgba(34, 197, 94, 0.35)',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          fontFamily: "'Space Mono', monospace",
          zIndex: 50
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.25)',
              border: '1px solid #22C55E',
              color: '#22C55E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              fontWeight: '900',
              boxShadow: '0 0 10px #22C55E'
            }}>
              🎧
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: '900', color: '#F8FAFC', letterSpacing: '0.8px' }}>
                  COACH RADIO — CONNECTED
                </span>
                <span style={{
                  background: 'rgba(34, 197, 94, 0.2)',
                  border: '1px solid #22C55E',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: '900',
                  color: '#22C55E'
                }}>
                  {callState.durationFormatted}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', fontSize: '11px' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: callState.coachVoiceStatus === 'MUTED' ? '#EAB308' : '#22C55E',
                  fontWeight: '800'
                }}>
                  <span style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: callState.coachVoiceStatus === 'MUTED' ? '#EAB308' : '#22C55E',
                    boxShadow: `0 0 6px ${callState.coachVoiceStatus === 'MUTED' ? '#EAB308' : '#22C55E'}`,
                    display: 'inline-block'
                  }} />
                  COACH: {callState.coachVoiceStatus === 'MUTED' ? 'MUTED' : 'LIVE'}
                </span>
                <span style={{ color: '#475569' }}>|</span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: callState.isMuted ? '#EF4444' : '#00E5FF',
                  fontWeight: '800'
                }}>
                  <span style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: callState.isMuted ? '#EF4444' : '#00E5FF',
                    boxShadow: `0 0 6px ${callState.isMuted ? '#EF4444' : '#00E5FF'}`,
                    display: 'inline-block'
                  }} />
                  DRIVER: {callState.isMuted ? 'AUDIO MUTED' : 'LISTENING'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Real Decibel Equalizer */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              height: '24px',
              width: '100px',
              background: 'rgba(0, 0, 0, 0.5)',
              padding: '2px 6px',
              borderRadius: '4px'
            }}>
              {[...Array(14)].map((_, i) => {
                const level = callState.audioLevel || (callState.remoteAudioLevel || 0)
                const heightPct = !callState.isMuted
                  ? Math.min(100, Math.max(15, level * Math.sin((i / 14) * Math.PI) * 1.5))
                  : 15
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${heightPct}%`,
                      background: callState.isMuted ? '#64748B' : '#00E5FF',
                      borderRadius: '1px',
                      transition: 'height 0.1s ease'
                    }}
                  />
                )
              })}
            </div>

            {/* Test Voice Link Reachability Button */}
            <button
              onClick={() => driverCallManager.sendVoiceTest('Cockpit to pit wall, radio check 5 by 5, loud and clear.')}
              style={{
                background: 'rgba(14, 165, 233, 0.2)',
                border: '1px solid #0EA5E9',
                borderRadius: '6px',
                padding: '8px 10px',
                color: '#38BDF8',
                fontSize: '10.5px',
                fontWeight: '800',
                cursor: 'pointer',
                fontFamily: "'Space Mono', monospace"
              }}
              title="Transmit radio check voice test back to coach console"
            >
              🔊 TEST VOICE
            </button>

            <button
              onClick={() => driverCallManager.toggleMute()}
              style={{
                background: callState.isMuted ? '#EAB308' : 'rgba(30, 41, 59, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                padding: '8px 12px',
                color: callState.isMuted ? '#000' : '#F8FAFC',
                fontSize: '11px',
                fontWeight: '800',
                cursor: 'pointer'
              }}
              title={callState.isMuted ? 'Unmute Incoming Coach Audio' : 'Mute Incoming Coach Audio in Helmet'}
            >
              {callState.isMuted ? '🔊 UNMUTE AUDIO' : '🔇 MUTE AUDIO'}
            </button>

            <button
              onClick={() => driverCallManager.endCall()}
              style={{
                background: 'linear-gradient(90deg, #EF4444, #DC2626)',
                border: '1px solid #F87171',
                borderRadius: '6px',
                padding: '8px 14px',
                color: '#fff',
                fontSize: '11px',
                fontWeight: '900',
                cursor: 'pointer',
                boxShadow: '0 0 12px rgba(239, 68, 68, 0.4)'
              }}
              title="End Voice Call"
            >
              🛑 END CALL
            </button>
          </div>
        </div>
      )}

      {/* INCOMING TACTICAL DIRECTIVE ACCEPTANCE BANNER (Driver-Side Message Acceptance Feature) */}
      {(driverMessageState.status === 'PENDING' || driverMessageState.status === 'ACCEPTED' || driverMessageState.status === 'DECLINED') && (
        <div style={{
          background: driverMessageState.status === 'ACCEPTED'
            ? 'linear-gradient(90deg, rgba(34, 197, 94, 0.2), rgba(15, 23, 42, 0.95))'
            : (driverMessageState.status === 'DECLINED'
              ? 'linear-gradient(90deg, rgba(239, 68, 68, 0.2), rgba(15, 23, 42, 0.95))'
              : 'linear-gradient(90deg, rgba(234, 179, 8, 0.25), rgba(15, 23, 42, 0.95))'),
          border: `2px solid ${
            driverMessageState.status === 'ACCEPTED'
              ? '#22c55e'
              : (driverMessageState.status === 'DECLINED' ? '#ef4444' : '#eab308')
          }`,
          boxShadow: `0 0 20px ${
            driverMessageState.status === 'ACCEPTED'
              ? 'rgba(34, 197, 94, 0.35)'
              : (driverMessageState.status === 'DECLINED' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(234, 179, 8, 0.4)')
          }`,
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          color: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              fontSize: '22px',
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: driverMessageState.status === 'ACCEPTED' ? 'rgba(34, 197, 94, 0.25)' : (driverMessageState.status === 'DECLINED' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(234, 179, 8, 0.25)'),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '900',
              color: driverMessageState.status === 'ACCEPTED' ? '#22c55e' : (driverMessageState.status === 'DECLINED' ? '#ef4444' : '#eab308')
            }}>
              {driverMessageState.status === 'ACCEPTED' ? '✓' : (driverMessageState.status === 'DECLINED' ? '✕' : '⚡')}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '11px',
                  fontWeight: '900',
                  letterSpacing: '1px',
                  color: driverMessageState.status === 'ACCEPTED' ? '#22c55e' : (driverMessageState.status === 'DECLINED' ? '#ef4444' : '#eab308')
                }}>
                  {driverMessageState.status === 'ACCEPTED'
                    ? 'DIRECTIVE ACCEPTED & EXECUTING BY DRIVER'
                    : (driverMessageState.status === 'DECLINED'
                      ? 'DIRECTIVE DECLINED BY DRIVER'
                      : 'INCOMING PIT WALL DIRECTIVE · AWAITING DRIVER ACCEPTANCE')}
                </span>
                <span style={{
                  fontSize: '9px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  color: '#38bdf8',
                  fontWeight: 'bold'
                }}>
                  {radioMessage?.action || 'TACTICAL ORDER'}
                </span>
              </div>

              <div style={{ fontSize: '13px', fontWeight: '800', marginTop: '2px', color: '#fff' }}>
                "{radioMessage?.transcript || radioText}"
              </div>

              {driverMessageState.replyText && (
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                  Driver Intercom Reply: <strong style={{ color: '#f8fafc' }}>"{driverMessageState.replyText}"</strong>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {driverMessageState.status === 'PENDING' ? (
            <div style={{ display: 'flex', gap: '8px', minWidth: '280px' }}>
              <button
                onClick={handleAcceptDirective}
                style={{
                  flex: 1,
                  background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  color: '#000',
                  fontWeight: '900',
                  fontSize: '11px',
                  cursor: 'pointer',
                  boxShadow: '0 0 10px rgba(34, 197, 94, 0.4)',
                  letterSpacing: '0.5px'
                }}
                title="Accept Pit Wall Order and Acknowledge to Coach"
              >
                ✓ ACCEPT (COPY THAT)
              </button>

              <button
                onClick={handleDeclineDirective}
                style={{
                  background: 'rgba(239, 68, 68, 0.25)',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  color: '#ef4444',
                  fontWeight: '800',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
                title="Decline Directive and Report Issue to Coach"
              >
                ✕ DECLINE
              </button>
            </div>
          ) : (
            <div style={{
              background: driverMessageState.status === 'ACCEPTED' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              border: `1px solid ${driverMessageState.status === 'ACCEPTED' ? '#22c55e' : '#ef4444'}`,
              color: driverMessageState.status === 'ACCEPTED' ? '#22c55e' : '#ef4444',
              padding: '6px 12px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: '900'
            }}>
              {driverMessageState.status === 'ACCEPTED' ? 'STATUS: ACCEPTED ✓✓' : 'STATUS: DECLINED ✕'}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TOP ROW: GRAPHICAL DRIVER COCKPIT MODEL (LEFT) + MOTEC OLED DISPLAY (RIGHT)
          ========================================================================= */}
      <div className="driver-station-top-row">
        {/* 1. INSIDE CAR COCKPIT ONBOARD VIEW & CONTROLS */}
        <section className="driver-graphical-model-card">
          <div className="card-micro-header">
            <div className="cm-title-group">
              <span className="cm-title">INSIDE CAR VIEW · COCKPIT POV & CONTROLS</span>
              <span className="cm-badge">MAX VERSTAPPEN #33</span>
            </div>

            {/* View Mode Switcher */}
            <div className="driver-view-mode-tabs">
              <button
                className={`dvm-tab-btn ${driverViewMode === 'ONBOARD_POV' ? 'active' : ''}`}
                onClick={() => setDriverViewMode('ONBOARD_POV')}
                title="Real-World Photographic Onboard View (Looking Through Titanium Halo)"
              >
                📷 ONBOARD POV
              </button>
              <button
                className={`dvm-tab-btn ${driverViewMode === 'COCKPIT_WHEEL' ? 'active' : ''}`}
                onClick={() => setDriverViewMode('COCKPIT_WHEEL')}
                title="Cockpit Carbon Monocoque & Steering Wheel Controls"
              >
                🕹️ WHEEL CONTROLS
              </button>
              <button
                className={`dvm-tab-btn ${driverViewMode === 'STEER_SIM' ? 'active' : ''}`}
                onClick={() => setDriverViewMode('STEER_SIM')}
                title="3D Dynamic Steering Rig Simulation"
              >
                🏎️ STEER SIM
              </button>
            </div>
          </div>

          {/* VIEW MODE 1: AUTHENTIC PHOTOGRAPHIC ONBOARD VIEW THROUGH HALO */}
          {driverViewMode === 'ONBOARD_POV' && (
            <div className="cockpit-photo-viewport onboard-halo-view">
              <img
                src="/f1_driver_cockpit_view.jpg"
                alt="F1 Driver Inside Car Cockpit Onboard View through Halo"
                className="cockpit-photo-img"
              />
              {/* Dynamic Real-Time HUD Overlay on the Onboard Camera View */}
              <div className="onboard-photo-hud-overlay">
                <div className="oph-top-strip">
                  <div className="oph-tag-pill">
                    <span className="live-rec-dot" />
                    <span>ONBOARD CAM 01 · 1080P 60FPS</span>
                  </div>
                  <div className="oph-circuit-pill">
                    <span>AUTODROMO MONZA · RETTIFILO T1</span>
                  </div>
                  <div className={`oph-drs-pill ${drsActive ? 'drs-open' : ''}`}>
                    <span>{drsActive ? 'DRS OPEN [ZONE 1]' : 'DRS ARMED'}</span>
                  </div>
                </div>

                {/* Dynamic Target Reticle Tracking Car Ahead on Track */}
                <div className="oph-target-reticle" style={{ transform: `translate(calc(-50% + ${currentSteerAngle * -2.5}px), -50%)` }}>
                  <div className="reticle-box">
                    <div className="reticle-corner tl" />
                    <div className="reticle-corner tr" />
                    <div className="reticle-corner bl" />
                    <div className="reticle-corner br" />
                    <div className="reticle-center-cross" />
                  </div>
                  <div className="reticle-data-badge">
                    <span className="r-code">{rivalDriver} #16</span>
                    <span className="r-gap">+{gapAhead.toFixed(2)}s</span>
                    <span className="r-spd">324 KM/H</span>
                  </div>
                </div>

                {/* Halo Central Strut HUD */}
                <div className="oph-halo-center-hud">
                  <div className="halo-gmeter">
                    <span className="g-val">4.2G</span>
                    <span className="g-sub">LAT LOAD</span>
                  </div>
                </div>

                {/* Bottom Real-Time Telemetry Readout on Camera View */}
                <div className="oph-bottom-telemetry-bar">
                  <div className="oph-tele-pod">
                    <span className="k">SPEED</span>
                    <span className="v highlight-cyan">{speed} <small>KM/H</small></span>
                  </div>
                  <div className="oph-tele-pod">
                    <span className="k">GEAR</span>
                    <span className="v highlight-gold">{gear}</span>
                  </div>
                  <div className="oph-tele-pod">
                    <span className="k">THROTTLE</span>
                    <span className="v highlight-green">{throttle}%</span>
                  </div>
                  <div className="oph-tele-pod">
                    <span className="k">BRAKE</span>
                    <span className="v highlight-red">{brake}%</span>
                  </div>
                  <div className="oph-tele-pod">
                    <span className="k">ERS SOC</span>
                    <span className="v highlight-green">{socPct}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: AUTHENTIC PHOTOGRAPHIC COCKPIT STEERING WHEEL & MONOCOQUE */}
          {driverViewMode === 'COCKPIT_WHEEL' && (
            <div className="cockpit-photo-viewport wheel-detail-view">
              <img
                src="/f1_cockpit_wheel.jpg"
                alt="F1 Cockpit Steering Wheel & Carbon Chassis Interior"
                className="cockpit-photo-img wheel-focus"
              />
              {/* Interactive Control Callouts over Real Photo */}
              <div className="cockpit-controls-interactive-overlay">
                <div className="ctrl-hotspot-badge hs-ddu">
                  <span className="hs-pulse" />
                  <div className="hs-content">
                    <span className="hs-title">DDU INSTRUMENT CLUSTER</span>
                    <span className="hs-desc">RPM: {rpm} · GEAR: {gear} · SPD: {speed} KM/H</span>
                  </div>
                </div>

                <div className="ctrl-hotspot-badge hs-mode">
                  <span className="hs-pulse" />
                  <div className="hs-content">
                    <span className="hs-title">STRAT ROTARY</span>
                    <span className="hs-desc">MODE 4 (OVERTAKE 120kW BOOST)</span>
                  </div>
                </div>

                <div className="ctrl-hotspot-badge hs-bb">
                  <span className="hs-pulse" />
                  <div className="hs-content">
                    <span className="hs-title">BRAKE BIAS</span>
                    <span className="hs-desc">56.4% FRONT BRAKE BIAS</span>
                  </div>
                </div>

                <div
                  className="ctrl-hotspot-badge hs-radio clickable"
                  onClick={handleCopyRadio}
                  title="Click to transmit driver radio response"
                >
                  <span className="hs-pulse green" />
                  <div className="hs-content">
                    <span className="hs-title">RADIO TRANSMIT PTT</span>
                    <span className="hs-desc">{acknowledged ? 'ACKNOWLEDGED ✓✓' : 'CLICK TO TRANSMIT [ACK]'}</span>
                  </div>
                </div>

                <div className="ctrl-hotspot-badge hs-drs">
                  <span className="hs-pulse cyan" />
                  <div className="hs-content">
                    <span className="hs-title">DRS PADDLE</span>
                    <span className="hs-desc">{drsActive ? 'DEPLOYED / OPEN' : 'ARMED'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 3: 3D DYNAMIC STEERING RIG SIMULATION */}
          {driverViewMode === 'STEER_SIM' && (
            <div
              className="cockpit-model-viewport"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const midX = rect.left + rect.width / 2
                const offset = ((e.clientX - midX) / (rect.width / 2)) * 12
                setUserSteerOffset(offset)
              }}
              onMouseLeave={() => setUserSteerOffset(0)}
            >
              {/* Forward Horizon through Helmet Visor */}
              <div className="visor-track-horizon">
                <span className="track-marker-tag">MONZA T1 APPROACH · {speed} KM/H</span>
                {/* Rival car ahead on track */}
                <div
                  className="horizon-rival-blip"
                  style={{ transform: `translateX(${currentSteerAngle * -1.5}px)` }}
                >
                  <div className="rival-wing-bar" />
                  <span className="rival-marker-pill">{rivalDriver} #16 +{gapAhead.toFixed(2)}s</span>
                </div>
              </div>

              {/* Titanium Halo Pillar & Carbon Frame */}
              <div className="cockpit-halo-strut">
                <div className="halo-gforce-pill">4.2G LAT</div>
              </div>

              {/* Graphical Driver Model: Helmet, Suit, Gloves & Steering Wheel */}
              <div className="driver-avatar-assembly">
                {/* Driver Helmet */}
                <div
                  className="driver-helmet-graphic"
                  style={{ transform: `translateX(-50%) rotate(${currentSteerAngle * 0.35}deg)` }}
                >
                  <div className="helmet-shell redbull-livery">
                    <div className="helmet-visor-gold" />
                    <div className="helmet-chin-spoiler" />
                    <span className="helmet-number">33</span>
                  </div>
                </div>

                {/* Driver Shoulders & Racing Suit */}
                <div className="driver-shoulders-torso">
                  <div className="suit-shoulder left" />
                  <div className="suit-chest-sponsor">RED BULL</div>
                  <div className="suit-shoulder right" />
                </div>

                {/* F1 Steering Wheel Held in Driver's Hands */}
                <div
                  className="driver-steering-wheel-rig"
                  style={{ transform: `translateX(-50%) rotate(${currentSteerAngle}deg)` }}
                >
                  <div className="driver-racing-glove glove-left" />
                  <div className="f1-wheel-graphic-body">
                    <div className="wheel-top-revs">
                      <div className={`mini-rev-pip ${speed > 270 ? 'lit' : ''}`} />
                      <div className={`mini-rev-pip ${speed > 285 ? 'lit' : ''}`} />
                      <div className={`mini-rev-pip ${speed > 300 ? 'lit red' : ''}`} />
                      <div className={`mini-rev-pip ${speed > 310 ? 'lit purple' : ''}`} />
                    </div>
                    <div className="wheel-center-screen">
                      <span className="w-gear">{gear}</span>
                      <span className="w-speed">{speed}</span>
                    </div>
                    <div className="wheel-rotary-left">M4</div>
                    <div className="wheel-rotary-right">58%</div>
                  </div>
                  <div className="driver-racing-glove glove-right" />
                </div>
              </div>

              {/* Steering Telemetry Overlay */}
              <div className="cockpit-steer-telemetry">
                <span className="cst-label">STEER ANGLE:</span>
                <span className="cst-val highlight-cyan">{currentSteerAngle > 0 ? `+${currentSteerAngle}° R` : `${currentSteerAngle}° L`}</span>
              </div>
            </div>
          )}

          {/* Quick-Switch Cockpit Photo Gallery Strip */}
          <div className="cockpit-gallery-strip">
            <div
              className={`gallery-thumb-card ${driverViewMode === 'ONBOARD_POV' ? 'active' : ''}`}
              onClick={() => setDriverViewMode('ONBOARD_POV')}
              title="Switch to Real Onboard POV through Halo"
            >
              <img src="/f1_driver_cockpit_view.jpg" alt="Halo Onboard POV" className="thumb-img" />
              <div className="thumb-meta">
                <span className="thumb-tag">CAM 01</span>
                <span className="thumb-label">HALO ONBOARD POV</span>
              </div>
            </div>

            <div
              className={`gallery-thumb-card ${driverViewMode === 'COCKPIT_WHEEL' ? 'active' : ''}`}
              onClick={() => setDriverViewMode('COCKPIT_WHEEL')}
              title="Switch to Cockpit Wheel & Controls View"
            >
              <img src="/f1_cockpit_wheel.jpg" alt="Cockpit Wheel Controls" className="thumb-img" />
              <div className="thumb-meta">
                <span className="thumb-tag">CAM 02</span>
                <span className="thumb-label">WHEEL & MONOCOQUE</span>
              </div>
            </div>

            <div
              className="gallery-thumb-card"
              onClick={() => setDriverViewMode('COCKPIT_WHEEL')}
              title="Switch to Monza Instrument Display View"
            >
              <img src="/f1_italian_gp_wheel.jpg" alt="Monza Instrument Display" className="thumb-img" />
              <div className="thumb-meta">
                <span className="thumb-tag">CAM 03</span>
                <span className="thumb-label">MONZA DDU DISPLAY</span>
              </div>
            </div>

            <div
              className={`gallery-thumb-card ${driverViewMode === 'STEER_SIM' ? 'active' : ''}`}
              onClick={() => setDriverViewMode('STEER_SIM')}
              title="Switch to 3D Steering Rig Simulator"
            >
              <div className="thumb-sim-graphic">
                <span className="sim-wheel-icon">🕹️</span>
              </div>
              <div className="thumb-meta">
                <span className="thumb-tag">SIM</span>
                <span className="thumb-label">3D STEERING RIG</span>
              </div>
            </div>
          </div>
        </section>

        {/* 2. MCLAREN PCU-8D DIGITAL DASHBOARD INSTRUMENTATION */}
        <section className="driver-motec-ddu-card">
          {/* Top 15-LED Shift Lights Array */}
          <div className={`ddu-rev-strip ${isShiftPoint ? 'shift-flash' : ''}`}>
            {Array.from({ length: revPips }).map((_, i) => {
              const active = i < activePips
              let col = 'green'
              if (i >= 10) col = 'purple'
              else if (i >= 5) col = 'red'
              return <div key={i} className={`rev-pip ${col} ${active ? 'lit' : ''}`} />
            })}
          </div>

          {/* DDU Status Header */}
          <div className="ddu-status-row">
            <div className={`ddu-flag-chip ${drsActive ? 'active' : (drsAvailable ? 'armed' : 'off')}`}>
              <span className="dot" />
              <span>{drsActive ? 'DRS OPEN' : (drsAvailable ? 'DRS ARMED' : 'DRS LOCKED')}</span>
            </div>
            <div className="ddu-track-status">
              <span className="dot green" />
              <span>TRACK CLEAR</span>
            </div>
            <div className={`ddu-mode-chip ${mode.toLowerCase()}`}>
              <span>{mode} · {mguKw > 0 ? `+${mguKw}kW` : `${mguKw}kW`}</span>
            </div>
          </div>

          {/* Hero Numbers: Speed, Giant Gear, Lap Delta */}
          <div className="ddu-hero-metrics-grid">
            <div className="ddu-metric-pod">
              <span className="pod-k">SPEED</span>
              <div className="pod-num-group">
                <span className="giant-num">{speed}</span>
                <span className="unit">KM/H</span>
              </div>
              <span className="pod-sub">{rpm.toLocaleString()} RPM</span>
            </div>

            {/* Giant Center Gear Indicator */}
            <div className="ddu-gear-pod">
              <span className="gear-tag">GEAR</span>
              <div className={`giant-gear-num ${isShiftPoint ? 'shift-warn' : ''}`}>
                {gear}
              </div>
              <span className="gear-sub">{isShiftPoint ? '▲ SHIFT UP' : 'OPTIMAL'}</span>
            </div>

            <div className="ddu-metric-pod">
              <span className="pod-k">LAP DELTA</span>
              <div className={`pod-num-group ${isDeltaPositive ? 'positive' : 'negative'}`}>
                <span className="giant-num">{delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}</span>
                <span className="unit">S</span>
              </div>
              <span className="pod-sub tyre">{tyreCompound[0]} · {tyreLife}% LIFE</span>
            </div>
          </div>

          {/* Tactical Status Strip */}
          <div className="ddu-tactical-strip">
            <div className={`ddu-tac-item ${isGapCritical ? 'critical' : ''}`}>
              <span className="tac-k">GAP TO {rivalDriver}</span>
              <span className="tac-v">{gapAhead < 10 ? `+${gapAhead.toFixed(2)}` : `+${gapAhead.toFixed(1)}`}s</span>
            </div>

            <div className="ddu-tac-item">
              <span className="tac-k">MGU-K SOC</span>
              <span className="tac-v highlight-green">{socPct}%</span>
            </div>

            <div className="ddu-tac-item">
              <span className="tac-k">TYRES (°C)</span>
              <span className="tac-v">{temps.fl}° · {temps.fr}°</span>
            </div>
          </div>

          {/* Strategy Directive Callout */}
          <div className={`ddu-directive-callout ${actionType}`}>
            <span className="directive-badge">{actionIcon}</span>
            <div className="directive-text">
              <span className="headline">{actionText}</span>
              <span className="subline">"{radioText}"</span>
            </div>
            <div className="prob-pill">
              <span className="pk">PROB</span>
              <span className="pv">{prob}%</span>
            </div>
          </div>
        </section>
      </div>

      {/* =========================================================================
          BOTTOM ROW: COCKPIT CONTROLS, CAN TELEMETRY & SECTOR SPLITS
          ========================================================================= */}
      <div className="driver-station-bottom-row">
        {/* 1. TACTILE STEERING BUTTONS & RADIO COMMS */}
        <section className="cockpit-controls-card">
          <div className="card-micro-header">
            <span className="cm-title">STEERING CONTROLS & RADIO</span>
          </div>

          <div className="controls-btn-grid">
            <button
              className={`tactile-comms-btn ${driverMessageState.status === 'ACCEPTED' ? 'acknowledged' : (driverMessageState.status === 'PENDING' ? 'has-msg' : '')}`}
              onClick={driverMessageState.status === 'PENDING' ? handleAcceptDirective : handleCopyRadio}
              style={{
                background: driverMessageState.status === 'ACCEPTED' ? '#22c55e' : (driverMessageState.status === 'PENDING' ? '#eab308' : undefined),
                color: (driverMessageState.status === 'ACCEPTED' || driverMessageState.status === 'PENDING') ? '#000' : undefined,
                fontWeight: '900'
              }}
              title="Acknowledge and Accept Pit Wall Directive"
            >
              <span className="btn-icon">🎙️</span>
              <span className="btn-txt">
                {driverMessageState.status === 'ACCEPTED'
                  ? 'ACCEPTED ✓✓'
                  : (driverMessageState.status === 'PENDING' ? '⚡ ACCEPT DIRECTIVE' : 'COPY RADIO (ACK)')}
              </span>
            </button>

            <button className={`tactile-drs-btn ${drsActive ? 'active' : (drsAvailable ? 'avail' : '')}`}>
              <span>DRS PADDLE: {drsActive ? 'OPEN' : (drsAvailable ? 'ARMED' : 'OFF')}</span>
            </button>
          </div>

          <div className="rotary-encoders-row">
            <div className="rotary-mini-item">
              <span className="rot-k">STRAT</span>
              <span className="rot-v gold">MODE 4</span>
            </div>
            <div className="rotary-mini-item">
              <span className="rot-k">DIFF</span>
              <span className="rot-v">58%</span>
            </div>
            <div className="rotary-mini-item">
              <span className="rot-k">BRAKE BIAS</span>
              <span className="rot-v">56.4% F</span>
            </div>
            <div className="rotary-mini-item">
              <span className="rot-k">MGU-K</span>
              <span className="rot-v cyan">120 kW</span>
            </div>
          </div>
        </section>

        {/* 2. CAN-BUS PEDALS & TYRE CARCASS THERMALS */}
        <section className="cockpit-can-telemetry-card">
          <div className="card-micro-header">
            <span className="cm-title">PEDAL TELEMETRY & TYRE CARCASS</span>
          </div>

          <div className="pedals-telemetry-grid">
            <div className="pedal-channel">
              <div className="pedal-top-label">
                <span>THROTTLE</span>
                <span className="pedal-val green">{throttle}%</span>
              </div>
              <div className="pedal-gauge-bar">
                <div className="pedal-fill thr" style={{ width: `${throttle}%` }} />
              </div>
            </div>

            <div className="pedal-channel">
              <div className="pedal-top-label">
                <span>BRAKE</span>
                <span className="pedal-val red">{brake}%</span>
              </div>
              <div className="pedal-gauge-bar">
                <div className="pedal-fill brk" style={{ width: `${brake}%` }} />
              </div>
            </div>
          </div>

          {/* 4 Tyre Carcass Temperatures */}
          <div className="tyre-carcass-matrix">
            <div className="tyre-thermal-box"><span>FL</span><b>{temps.fl}°C</b></div>
            <div className="tyre-thermal-box"><span>FR</span><b>{temps.fr}°C</b></div>
            <div className="tyre-thermal-box"><span>RL</span><b>{temps.rl}°C</b></div>
            <div className="tyre-thermal-box"><span>RR</span><b>{temps.rr}°C</b></div>
          </div>
        </section>

        {/* 3. MONZA SECTOR TIMINGS & STATUS */}
        <section className="cockpit-sectors-card">
          <div className="card-micro-header">
            <span className="cm-title">MONZA GP SECTOR TIMINGS</span>
          </div>

          <div className="sectors-timing-list">
            <div className="sector-split-item purple">
              <span className="sec-k">S1 (RETTIFILO)</span>
              <span className="sec-t">27.842s</span>
              <span className="sec-d">-0.082s</span>
            </div>
            <div className="sector-split-item yellow">
              <span className="sec-k">S2 (LESMO / ASCARI)</span>
              <span className="sec-t">37.114s</span>
              <span className="sec-d">+0.120s</span>
            </div>
            <div className="sector-split-item green">
              <span className="sec-k">S3 (PARABOLICA)</span>
              <span className="sec-t">27.765s</span>
              <span className="sec-d">-0.214s</span>
            </div>
          </div>

          <div className="sector-summary-footer">
            <span>LAP {lap}/{totalLaps}</span>
            <span className="highlight-cyan">P{position} · VER #33</span>
          </div>
        </section>
      </div>
    </div>
  )
}
