import React, { useEffect } from 'react'
import { playRadioBeep, playDriverAckBeep, speakDriverAck } from '../utils/radioAudio.js'
import { getApiUrl } from '../config.js'

/**
 * DriverCallModal — Driver Cockpit WebRTC Voice Call Acceptance & Active Radio HUD
 *
 * Implements:
 * 1. Incoming Call State:
 *    PIT WALL COACH
 *    ● INCOMING CALL
 *    [ ACCEPT ] [ REJECT ]
 *
 * 2. Connected State:
 *    PIT WALL COACH
 *    ● CONNECTED
 *    🎙 MICROPHONE ACTIVE (or MUTED)
 *    [ MUTE ] [ END CALL ]
 *
 * 3. Two-Way Audio: Live WebRTC voice link with F1 Helmet Intercom bandpass filter
 * 4. Quick driver voice response transmission buttons
 */
export default function DriverCallModal({
  callState,
  onAccept,
  onDecline,
  onReject,
  onEndCall,
  onToggleMute
}) {
  if (!callState || callState.status === 'IDLE') return null

  const isRinging = callState.status === 'RINGING'
  const isConnected = callState.status === 'CONNECTED'
  const isRejected = callState.status === 'REJECTED'
  const isEnded = callState.status === 'ENDED'

  const handleRejectAction = onReject || onDecline

  // Ringing audio chime effect
  useEffect(() => {
    let interval
    if (isRinging) {
      playRadioBeep()
      interval = setInterval(() => {
        playRadioBeep()
      }, 2400)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isRinging])

  const handleDriverQuickSay = (text) => {
    playDriverAckBeep()
    speakDriverAck(text, true)
    fetch(getApiUrl('/api/radio/ack'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'VOICE_REPLY',
        reply: text,
        time: new Date().toTimeString().split(' ')[0]
      })
    }).catch(() => {})
  }

  // =========================================================================
  // 1. INCOMING CALL NOTIFICATION (RINGING STATE)
  // =========================================================================
  if (isRinging) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        fontFamily: "'Space Mono', monospace"
      }}>
        <div style={{
          background: '#0A0F1D',
          border: '2px solid #EAB308',
          borderRadius: '12px',
          boxShadow: '0 0 40px rgba(234, 179, 8, 0.6)',
          padding: '26px 28px',
          width: '440px',
          maxWidth: '92vw',
          color: '#F8FAFC',
          textAlign: 'center'
        }}>
          {/* Header Lockup */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{
              fontSize: '15px',
              fontWeight: '900',
              color: '#F8FAFC',
              letterSpacing: '1px',
              textTransform: 'uppercase',
              marginBottom: '6px'
            }}>
              PIT WALL COACH
            </div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(234, 179, 8, 0.15)',
              border: '1px solid #EAB308',
              borderRadius: '20px',
              padding: '4px 14px'
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#EAB308',
                boxShadow: '0 0 10px #EAB308',
                display: 'inline-block',
                animation: 'pulse 1.2s infinite'
              }} />
              <span style={{
                fontSize: '12px',
                fontWeight: '900',
                color: '#FDE047',
                letterSpacing: '0.8px'
              }}>
                ● INCOMING CALL
              </span>
            </div>
          </div>

          <div style={{
            background: 'rgba(234, 179, 8, 0.08)',
            border: '1px solid rgba(234, 179, 8, 0.25)',
            borderRadius: '6px',
            padding: '10px 12px',
            marginBottom: '20px',
            fontSize: '11px',
            color: '#FEF08A',
            lineHeight: 1.4
          }}>
            Coach is requesting live encrypted voice channel to your cockpit helmet headset.
            Accepting opens live incoming audio from the pit wall coach.
          </div>

          {/* Action Buttons: [ ACCEPT CALL ] [ DECLINE CALL ] */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onAccept}
              style={{
                flex: 1.4,
                background: 'linear-gradient(90deg, #22C55E, #16A34A)',
                border: '1px solid #4ADE80',
                color: '#000000',
                fontWeight: '900',
                padding: '12px 18px',
                borderRadius: '8px',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 0 18px rgba(34, 197, 94, 0.45)',
                letterSpacing: '0.5px'
              }}
            >
              <span>✓</span> ACCEPT CALL
            </button>

            <button
              onClick={handleRejectAction}
              style={{
                flex: 1,
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid #EF4444',
                color: '#EF4444',
                fontWeight: '800',
                padding: '12px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                cursor: 'pointer',
                letterSpacing: '0.5px'
              }}
            >
              ✕ DECLINE CALL
            </button>
          </div>
        </div>
      </div>
    )
  }

  // =========================================================================
  // 2. CONNECTED STATE (COCKPIT ACTIVE RADIO HUD)
  // =========================================================================
  if (isConnected) {
    return (
      <div style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        background: '#0A0F1D',
        border: '2px solid #22C55E',
        borderRadius: '10px',
        boxShadow: '0 0 28px rgba(34, 197, 94, 0.4)',
        padding: '14px 18px',
        zIndex: 10000,
        width: '380px',
        maxWidth: '92vw',
        color: '#F8FAFC',
        fontFamily: "'Space Mono', monospace"
      }}>
        {/* Header: COACH RADIO — CONNECTED */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: '8px'
        }}>
          <div>
            <div style={{
              fontSize: '12px',
              fontWeight: '900',
              color: '#F8FAFC',
              letterSpacing: '1px'
            }}>
              COACH RADIO — CONNECTED
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '4px',
              fontSize: '10px'
            }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
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
                gap: '4px',
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

          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontFamily: 'monospace',
              fontSize: '14px',
              fontWeight: '900',
              color: '#22C55E',
              background: 'rgba(0, 0, 0, 0.5)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(34, 197, 94, 0.3)'
            }}>
              {callState.durationFormatted}
            </div>
            <div style={{
              fontSize: '8.5px',
              fontWeight: '700',
              color: '#94A3B8',
              marginTop: '3px'
            }}>
              CH-1 HEADSET
            </div>
          </div>
        </div>

        {/* Real Dynamic Audio Equalizer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          height: '20px',
          marginBottom: '10px',
          background: 'rgba(0, 0, 0, 0.5)',
          padding: '2px 8px',
          borderRadius: '4px',
          border: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          {[...Array(20)].map((_, i) => {
            const level = callState.audioLevel || (callState.remoteAudioLevel || 0)
            const heightPct = !callState.isMuted
              ? Math.min(100, Math.max(15, level * Math.sin((i / 20) * Math.PI) * 1.5))
              : 15
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${heightPct}%`,
                  background: callState.isMuted ? '#475569' : '#00E5FF',
                  borderRadius: '1px',
                  transition: 'height 0.1s ease'
                }}
              />
            )
          })}
        </div>

        {/* Quick Driver Voice Responses */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '5px',
          marginBottom: '10px'
        }}>
          {[
            'ROGER / COPY',
            'PUSHING NOW',
            'TYRES CRITICAL'
          ].map((resp) => (
            <button
              key={resp}
              onClick={() => handleDriverQuickSay(resp)}
              style={{
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#CBD5E1',
                borderRadius: '4px',
                padding: '5px 2px',
                fontSize: '9px',
                fontWeight: '700',
                cursor: 'pointer',
                fontFamily: "'Space Mono', monospace"
              }}
              title={`Quick vocal reply: ${resp}`}
            >
              🎙️ {resp}
            </button>
          ))}
        </div>

        {/* Controls: [ MUTE AUDIO ] & [ END CALL ] */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onToggleMute}
            style={{
              flex: 1,
              background: callState.isMuted ? '#EAB308' : 'rgba(30, 41, 59, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '5px',
              padding: '7px',
              color: callState.isMuted ? '#000000' : '#F8FAFC',
              fontSize: '11px',
              fontWeight: '800',
              cursor: 'pointer'
            }}
            title={callState.isMuted ? 'Unmute incoming coach voice' : 'Mute incoming coach voice'}
          >
            {callState.isMuted ? '🔊 UNMUTE AUDIO' : '🔇 MUTE AUDIO'}
          </button>

          <button
            onClick={onEndCall}
            style={{
              flex: 1.2,
              background: 'linear-gradient(90deg, #EF4444, #DC2626)',
              border: '1px solid #F87171',
              borderRadius: '5px',
              padding: '7px',
              color: '#FFFFFF',
              fontSize: '11px',
              fontWeight: '900',
              cursor: 'pointer',
              boxShadow: '0 0 10px rgba(239, 68, 68, 0.35)'
            }}
          >
            🛑 END CALL
          </button>
        </div>
      </div>
    )
  }

  // =========================================================================
  // 3. REJECTED OR ENDED BRIEF TOAST NOTICE
  // =========================================================================
  if (isRejected || isEnded) {
    return (
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: '#0B111E',
        border: isRejected ? '1px solid #EF4444' : '1px solid #64748B',
        borderRadius: '8px',
        padding: '10px 16px',
        zIndex: 10000,
        color: '#F8FAFC',
        fontSize: '11px',
        fontFamily: "'Space Mono', monospace",
        boxShadow: '0 4px 20px rgba(0,0,0,0.6)'
      }}>
        <div style={{ color: isRejected ? '#EF4444' : '#94A3B8', fontWeight: '800' }}>
          {isRejected ? '✕ CALL REJECTED' : '⏹ RADIO CALL ENDED'}
        </div>
        <div style={{ fontSize: '9px', color: '#64748B', marginTop: '2px' }}>
          Channel CH-1 Standby
        </div>
      </div>
    )
  }

  return null
}