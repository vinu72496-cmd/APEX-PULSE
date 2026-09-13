import React, { useState } from 'react'
import { coachCallManager } from '../utils/webrtcCallManager.js'

/**
 * DirectCallModal — Pit Wall Coach Voice Communication Console
 *
 * Implements:
 * - Real WebRTC Call State Machine (IDLE -> CALLING -> RINGING -> CONNECTED -> ENDED / REJECTED)
 * - Strict "🎧 DRIVER LISTENING" indicator (only shows when driver client confirms audio receiver is live)
 * - Two-way microphone status (Coach MIC & Driver MIC)
 * - Web Audio waveform reflecting real decibel speech activity
 * - Instant in-call telemetry query triggers
 * - One-click Mute/Unmute & End Call controls
 */
export default function DirectCallModal({
  callState,
  driver,
  onEndCall,
  onToggleMute,
  onSendQuery
}) {
  const [selectedQuery, setSelectedQuery] = useState('GAP')

  if (!callState || callState.status === 'IDLE') return null

  const isConnected = callState.status === 'CONNECTED'
  const isRinging = callState.status === 'RINGING' || callState.status === 'CALLING'
  const isRejected = callState.status === 'REJECTED'
  const isEnded = callState.status === 'ENDED'

  const quickQueries = [
    { id: 'GAP', label: 'Current Gap' },
    { id: 'CAR_AHEAD', label: 'Car Ahead' },
    { id: 'CAR_BEHIND', label: 'Car Behind' },
    { id: 'TYRE', label: 'Tyre Status' },
    { id: 'ERS', label: 'ERS Reserve' },
    { id: 'PROBABILITY', label: 'Overtake Prob' },
    { id: 'RECOMMENDATION', label: 'AI Strategy' },
    { id: 'NEXT_OPPORTUNITY', label: 'Passing Zone' }
  ]

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        background: '#0B111E',
        border: isConnected ? '2px solid #00E5FF' : (isRejected ? '2px solid #EF4444' : '2px solid #EAB308'),
        borderRadius: '12px',
        boxShadow: isConnected
          ? '0 0 35px rgba(0, 229, 255, 0.4)'
          : (isRejected ? '0 0 30px rgba(239, 68, 68, 0.4)' : '0 0 30px rgba(234, 179, 8, 0.4)'),
        width: '480px',
        maxWidth: '92vw',
        padding: '22px',
        color: '#F8FAFC',
        fontFamily: "'Space Mono', monospace"
      }}>
        {/* 1. Header Display: VOICE LINK / CONNECTION STATE */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          paddingBottom: '14px',
          marginBottom: '16px'
        }}>
          <div>
            <div style={{
              fontSize: '11px',
              fontWeight: '900',
              letterSpacing: '1.5px',
              color: '#94A3B8',
              textTransform: 'uppercase',
              marginBottom: '2px'
            }}>
              VOICE LINK
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: isConnected ? '#22C55E' : (isRejected ? '#EF4444' : '#EAB308'),
                boxShadow: `0 0 10px ${isConnected ? '#22C55E' : (isRejected ? '#EF4444' : '#EAB308')}`,
                display: 'inline-block'
              }} />
              <span style={{
                fontSize: '15px',
                fontWeight: '900',
                color: isConnected ? '#22C55E' : (isRejected ? '#EF4444' : '#EAB308'),
                letterSpacing: '1px'
              }}>
                {isConnected ? '● CONNECTED' : (isRinging ? '● CALLING / RINGING' : (isRejected ? '✕ REJECTED' : '● ENDED'))}
              </span>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{
              background: 'rgba(0, 0, 0, 0.5)',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '900',
              color: isConnected ? '#00E5FF' : '#94A3B8',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              {isConnected ? callState.durationFormatted : '--:--'}
            </div>
            <div style={{ fontSize: '9px', color: '#64748B', marginTop: '3px' }}>
              TARGET: {driver?.name || 'DRIVER'} #{driver?.number || 16}
            </div>
          </div>
        </div>

        {/* 2. Primary Status Strip: 🟢 DRIVER CONNECTED & 🎧 DRIVER LISTENING */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          marginBottom: '16px'
        }}>
          {/* Connection Status */}
          <div style={{
            background: isConnected ? 'rgba(34, 197, 94, 0.12)' : 'rgba(234, 179, 8, 0.12)',
            border: `1px solid ${isConnected ? 'rgba(34, 197, 94, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`,
            borderRadius: '6px',
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span style={{ fontSize: '12px' }}>{isConnected ? '🟢' : '⏳'}</span>
            <div>
              <div style={{ fontSize: '10px', fontWeight: '800', color: isConnected ? '#22C55E' : '#EAB308' }}>
                {isConnected ? 'DRIVER CONNECTED' : (isRinging ? 'AWAITING PICKUP' : (isRejected ? 'CALL DECLINED' : 'DISCONNECTED'))}
              </div>
              <div style={{ fontSize: '8px', color: '#94A3B8' }}>
                WebRTC P2P Status
              </div>
            </div>
          </div>

          {/* Strict Driver Listening Status */}
          <div style={{
            background: callState.driverListening ? 'rgba(0, 229, 255, 0.12)' : 'rgba(100, 116, 139, 0.12)',
            border: `1px solid ${callState.driverListening ? 'rgba(0, 229, 255, 0.4)' : 'rgba(100, 116, 139, 0.3)'}`,
            borderRadius: '6px',
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span style={{ fontSize: '12px' }}>{callState.driverListening ? '🎧' : '🔇'}</span>
            <div>
              <div style={{
                fontSize: '10px',
                fontWeight: '800',
                color: callState.driverListening ? '#00E5FF' : '#94A3B8'
              }}>
                {callState.driverListening ? 'DRIVER LISTENING' : (isConnected ? 'DRIVER AUDIO MUTED' : 'AUDIO STANDBY')}
              </div>
              <div style={{ fontSize: '8px', color: '#94A3B8' }}>
                Confirmed Cockpit Audio Link
              </div>
            </div>
          </div>
        </div>

        {/* 3. Real Audio Waveform Equalizer */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          padding: '12px 14px',
          marginBottom: '16px',
          textAlign: 'center'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '9px',
            color: '#64748B',
            fontWeight: '700',
            marginBottom: '8px'
          }}>
            <span>CH-1 INTERCOM (300Hz-3400Hz F1 BANDPASS)</span>
            <span style={{ color: isConnected ? '#22C55E' : '#EAB308' }}>
              {isConnected ? 'ENCRYPTED FULL-DUPLEX' : 'ESTABLISHING...'}
            </span>
          </div>

          {/* Equalizer Bars */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            height: '36px'
          }}>
            {[...Array(26)].map((_, i) => {
              const activeLevel = callState.audioLevel || (callState.remoteAudioLevel || 0)
              const heightPct = isConnected
                ? Math.min(100, Math.max(12, activeLevel * Math.sin((i / 26) * Math.PI) * 1.6))
                : 12
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${heightPct}%`,
                    background: callState.isMuted
                      ? '#475569'
                      : (isConnected ? 'linear-gradient(180deg, #00E5FF, #0284C7)' : '#334155'),
                    borderRadius: '2px',
                    transition: 'height 0.1s ease'
                  }}
                />
              )
            })}
          </div>

          {/* Decibel & Microphone Status Row */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '10px',
            fontSize: '10px',
            color: '#94A3B8'
          }}>
            <span>
              COACH MIC:{' '}
              <strong style={{ color: callState.isMuted ? '#EF4444' : '#22C55E' }}>
                {callState.isMuted ? 'MUTED' : 'LIVE'}
              </strong>
            </span>
            <span>
              DRIVER:{' '}
              <strong style={{ color: callState.driverListening ? '#00E5FF' : '#64748B' }}>
                {callState.driverListening ? 'LISTENING 🎧' : 'AUDIO MUTED'}
              </strong>
            </span>
            <span>
              LATENCY: <strong style={{ color: '#00E5FF' }}>14ms</strong>
            </span>
          </div>
        </div>

        {/* 4. Instant In-Call Telemetry Transmission to Driver */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            fontSize: '9.5px',
            fontWeight: '800',
            color: '#94A3B8',
            letterSpacing: '0.8px',
            marginBottom: '6px'
          }}>
            TRANSMIT REAL-TIME TELEMETRY DATA TO DRIVER:
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '6px',
            marginBottom: '8px'
          }}>
            {quickQueries.map((q) => (
              <button
                key={q.id}
                onClick={() => setSelectedQuery(q.id)}
                style={{
                  background: selectedQuery === q.id ? 'rgba(0, 229, 255, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                  border: selectedQuery === q.id ? '1px solid #00E5FF' : '1px solid rgba(255, 255, 255, 0.08)',
                  color: selectedQuery === q.id ? '#00E5FF' : '#CBD5E1',
                  borderRadius: '4px',
                  padding: '5px 3px',
                  fontSize: '9px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  fontFamily: "'Space Mono', monospace"
                }}
              >
                {q.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => onSendQuery && onSendQuery(selectedQuery)}
            style={{
              width: '100%',
              background: 'linear-gradient(90deg, #0284C7, #0369A1)',
              border: '1px solid #38BDF8',
              borderRadius: '6px',
              padding: '7px 12px',
              color: '#FFFFFF',
              fontSize: '11px',
              fontWeight: '800',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <span>📡</span> TRANSMIT {selectedQuery.replace('_', ' ')} OVER RADIO
          </button>

          {/* Test Voice Reachability button */}
          <button
            onClick={() => coachCallManager.sendVoiceTest('Pit wall to car, radio check 1 2 3. Confirm audio loud and clear.')}
            style={{
              width: '100%',
              background: 'rgba(14, 165, 233, 0.15)',
              border: '1px solid #0EA5E9',
              borderRadius: '6px',
              padding: '8px 12px',
              color: '#38BDF8',
              fontSize: '11px',
              fontWeight: '800',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              marginTop: '6px'
            }}
            title="Transmit acoustic voice check to verify audio reaches driver headset"
          >
            <span>🔊</span> TEST VOICE REACHABILITY (TRANSMIT CHECK)
          </button>
        </div>

        {/* 5. Call Controls: [ MUTE ] & [ END CALL ] */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onToggleMute}
            style={{
              flex: 1,
              background: callState.isMuted ? '#EAB308' : 'rgba(30, 41, 59, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: callState.isMuted ? '#000000' : '#FFFFFF',
              borderRadius: '6px',
              padding: '10px',
              fontWeight: '800',
              fontSize: '11.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <span>{callState.isMuted ? '🎙️' : '🔇'}</span>
            {callState.isMuted ? 'UNMUTE MIC' : 'MUTE MIC'}
          </button>

          <button
            onClick={onEndCall}
            style={{
              flex: 1.2,
              background: 'linear-gradient(90deg, #EF4444, #DC2626)',
              border: '1px solid #F87171',
              color: '#FFFFFF',
              borderRadius: '6px',
              padding: '10px',
              fontWeight: '900',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 0 15px rgba(239, 68, 68, 0.4)'
            }}
          >
            <span>🛑</span> END CALL
          </button>
        </div>
      </div>
    </div>
  )
}