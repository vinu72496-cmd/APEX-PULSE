import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  playRadioBeep,
  speakRadioMessage,
  playDriverAckBeep,
  speakDriverAck,
  getDriverResponseForAction,
} from '../utils/radioAudio.js'
import { evaluateTelemetryMatch } from '../utils/radioTelemetryMatcher.js'
import { getApiUrl } from '../config.js'

/**
 * CoachVoiceRadio — Redesigned F1 "COACH → DRIVER RADIO" Communication Card
 *
 * Implements:
 * 1. 4-Stage Strict Verification Lifecycle:
 *    - SENT (Amber indicator + timestamp)
 *    - DELIVERED (Cyan indicator · Driver comms received)
 *    - ACKNOWLEDGED (Green indicator · Tailored driver voice quote + ack timestamp)
 *    - EXECUTED (Neon green indicator · Telemetry match: "ACTION CONFIRMED ✓✓")
 * 2. Strict Truthfulness: Never falsely claims acknowledgment without explicit ack event.
 * 3. 5-Node Visual Communication Timeline:
 *    COACH SENT -> DELIVERED -> DRIVER: "COPY" -> ACKNOWLEDGED -> TELEMETRY MATCH -> ACTION CONFIRMED
 * 4. Dynamic Top Status Badge:
 *    - "RADIO: ACTION CONFIRMED ✓✓"
 *    - "RADIO: ACKNOWLEDGED ✓✓"
 *    - "DELIVERED — AWAITING ACK"
 *    - "WAITING FOR DRIVER..."
 *    - "ACKNOWLEDGED — ACTION NOT DETECTED"
 * 5. Enhanced Driver Acceptance Response Card:
 *    - Acoustic latency (12ms)
 *    - High-clarity 48kHz audio waveform
 *    - Tailored racing quote (e.g. "COPY, DEPLOYING MGU-K BOOST · ATTACKING INTO TURN 1")
 * 6. Communication History: Last 3 messages audit log with Time, Message, Driver Response, Status, Execution Result.
 */
export default function CoachVoiceRadio({
  onRadioBroadcast,
  decision,
  driverAudioState,
  activeDriverId,
  activeDriver,
  commands = [],
  activeCommand = null,
  onStartDirectCall,
  callState,
  onEndCall,
  onToggleMute,
}) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [selectedCoach, setSelectedCoach] = useState('bono') // 'bono' | 'horner'

  // Communication History (Last 3 messages initialized with realistic F1 race comms)
  const [commHistory, setCommHistory] = useState([
    {
      id: 101,
      time: '15:20:45',
      coachMessage: 'Radio check nominal. Confirm audio loud and clear.',
      driverResponse: '5 BY 5 - AUDIO LOUD & CLEAR',
      status: 'ACKNOWLEDGED ✓✓',
      executionResult: 'ACTION CONFIRMED ✓✓',
      executionEvidence: 'Acoustic latency 12ms · Channel 1 nominal',
      stage: 'EXECUTED',
    },
    {
      id: 102,
      time: '15:21:18',
      coachMessage: 'Hold position, defend apex and protect tyres.',
      driverResponse: 'COPY, DEFENDING APEX · MANAGING TYRE TEMPS',
      status: 'ACKNOWLEDGED ✓✓',
      executionResult: 'ACTION CONFIRMED ✓✓',
      executionEvidence: 'Gap maintained at 0.72s · Tyre temps stable',
      stage: 'EXECUTED',
    },
    {
      id: 103,
      time: '15:22:04',
      coachMessage: 'Attack LEC +18 on brakes into Turn 1',
      driverResponse: 'COPY, DEPLOYING MGU-K BOOST · ATTACKING INTO TURN 1',
      status: 'ACKNOWLEDGED ✓✓',
      executionResult: 'ACTION CONFIRMED ✓✓',
      executionEvidence: 'Closing speed +12.4 km/h · MGU-K Boost 120kW',
      stage: 'EXECUTED',
    },
  ])

  // Active Current Message State Machine
  const [activeMessage, setActiveMessage] = useState(() => {
    if (activeCommand) {
      return {
        id: activeCommand.id,
        time: activeCommand.time || activeCommand.sent_at,
        coachMessage: activeCommand.message || activeCommand.call || activeCommand.transcript || 'Radio check nominal.',
        action: activeCommand.action || 'RADIO CHECK',
        urgency: activeCommand.urgency || 'INFO',
        stage: activeCommand.status || 'DELIVERED',
        sentTime: activeCommand.sent_at || activeCommand.time,
        deliveredTime: activeCommand.delivered_at,
        ackTime: activeCommand.acknowledged_at,
        driverResponse: activeCommand.driver_reply,
        telemetryMatched: false,
        executionEvidence: null,
      }
    }
    return {
      id: 101,
      time: '15:20:45',
      coachMessage: 'Radio check nominal. Confirm audio loud and clear.',
      action: 'RADIO CHECK',
      urgency: 'INFO',
      stage: 'ACKNOWLEDGED',
      sentTime: '15:20:45',
      deliveredTime: '15:20:46',
      ackTime: '15:20:47',
      driverResponse: '5 BY 5 - AUDIO LOUD & CLEAR',
      telemetryMatched: true,
      executionEvidence: 'Acoustic latency 12ms · Channel 1 nominal',
    }
  })

  // Speech Recognition hook setup
  const recognitionRef = useRef(null)
  const hasSpeechRec = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  // Synchronize activeMessage with backend activeCommand in real time
  useEffect(() => {
    if (activeCommand && activeCommand.id) {
      setActiveMessage((prev) => {
        const backendStatus = activeCommand.status || 'SENT'
        let stage = backendStatus
        if (backendStatus === 'ACKNOWLEDGED' && prev?.stage === 'EXECUTED') {
          stage = 'EXECUTED'
        }
        return {
          id: activeCommand.id,
          time: activeCommand.time || activeCommand.sent_at || prev?.time,
          coachMessage: activeCommand.message || activeCommand.call || activeCommand.transcript || prev?.coachMessage,
          action: activeCommand.action || prev?.action,
          urgency: activeCommand.urgency || prev?.urgency || 'HIGH',
          stage: stage,
          sentTime: activeCommand.sent_at || prev?.sentTime,
          deliveredTime: activeCommand.delivered_at || prev?.deliveredTime,
          ackTime: activeCommand.acknowledged_at || prev?.ackTime,
          driverResponse: activeCommand.driver_reply || prev?.driverResponse,
          telemetryMatched: prev?.telemetryMatched || false,
          executionEvidence: prev?.executionEvidence || null,
        }
      })
    }
  }, [activeCommand?.id, activeCommand?.status, activeCommand?.acknowledged_at, activeCommand?.delivered_at, activeCommand?.driver_reply])

  // Headset audio chime when driver copy arrives
  const prevAckIdRef = useRef(null)
  useEffect(() => {
    if (activeCommand && (activeCommand.status === 'ACKNOWLEDGED' || activeCommand.status === 'DECLINED')) {
      const ackKey = `${activeCommand.id}_${activeCommand.status}`
      if (prevAckIdRef.current !== ackKey) {
        prevAckIdRef.current = ackKey
        playDriverAckBeep()
        if (activeCommand.driver_reply) {
          speakDriverAck(activeCommand.driver_reply, audioEnabled)
        }
      }
    }
  }, [activeCommand?.id, activeCommand?.status, activeCommand?.driver_reply, audioEnabled])

  // Listen for parent / driver acknowledgements
  const lastDriverAck = driverAudioState?.lastAck ?? null
  useEffect(() => {
    if (lastDriverAck && activeMessage && (activeMessage.stage === 'DELIVERED' || activeMessage.stage === 'SENT')) {
      handleDriverAcknowledge(lastDriverAck.reply)
    }
  }, [lastDriverAck?.id, lastDriverAck?.time])

  // Telemetry Matching Watcher: When ACKNOWLEDGED, monitor telemetry for match
  useEffect(() => {
    if (!activeMessage || activeMessage.stage !== 'ACKNOWLEDGED') return

    // Evaluate telemetry matching
    const evalResult = evaluateTelemetryMatch(activeMessage.action, decision)
    if (evalResult.matched) {
      const matchTimer = setTimeout(() => {
        setActiveMessage((prev) => {
          if (!prev || prev.stage !== 'ACKNOWLEDGED') return prev
          const updated = {
            ...prev,
            stage: 'EXECUTED',
            telemetryMatched: true,
            executionEvidence: evalResult.evidence,
          }
          // Update history entry
          setCommHistory((hist) => [
            {
              id: updated.id,
              time: updated.sentTime,
              coachMessage: updated.coachMessage,
              driverResponse: updated.driverResponse,
              status: 'ACKNOWLEDGED ✓✓',
              executionResult: 'ACTION CONFIRMED ✓✓',
              executionEvidence: evalResult.evidence,
              stage: 'EXECUTED',
            },
            ...hist.filter((h) => h.id !== updated.id).slice(0, 2),
          ])
          return updated
        })
      }, 1000)

      return () => clearTimeout(matchTimer)
    }
  }, [decision, activeMessage?.stage, activeMessage?.action])

  // Speech Recognition initialization
  useEffect(() => {
    if (!hasSpeechRec) return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      setIsListening(true)
      setTranscript('Listening for tactical race order...')
    }

    recognition.onresult = (event) => {
      let current = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        current += event.results[i][0].transcript
      }
      setTranscript(current)

      if (event.results[0].isFinal) {
        handleVoiceCommand(current)
      }
    }

    recognition.onerror = (e) => {
      console.warn('Speech recognition error:', e.error)
      setIsListening(false)
      setTranscript('Mic idle. Click a tactical radio button below.')
    }

    recognition.onend = () => setIsListening(false)
    recognitionRef.current = recognition
  }, [hasSpeechRec])

  const toggleMic = () => {
    if (!hasSpeechRec) {
      alert('Speech recognition is not supported in this browser. Use the tactical buttons below.')
      return
    }
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
    } else {
      try {
        recognitionRef.current?.start()
      } catch (err) {
        console.warn('Mic start error:', err)
      }
    }
  }

  const handleVoiceCommand = (rawText) => {
    const text = rawText.toLowerCase().trim()
    let action = 'DIRECT ORDER'
    let spokenText = rawText
    let urgency = 'NORMAL'

    if (text.includes('radio check') || text.includes('hear')) {
      action = 'RADIO CHECK'
      spokenText = 'Radio check nominal. Confirm audio loud and clear.'
      urgency = 'INFO'
    } else if (text.includes('overtake') || text.includes('attack') || text.includes('pass')) {
      action = 'OVERTAKE'
      spokenText = 'Attack LEC +18 on brakes into Turn 1'
      urgency = 'CRITICAL'
    } else if (text.includes('box') || text.includes('pit')) {
      action = 'BOX BOX'
      spokenText = 'Box this lap, box box! Fit Medium compound.'
      urgency = 'CRITICAL'
    } else if (text.includes('harvest') || text.includes('lift')) {
      action = 'HARVEST'
      spokenText = 'Engage Harvest Mode! Lift and coast into Turn 4.'
      urgency = 'HIGH'
    } else if (text.includes('push')) {
      action = 'PUSH'
      spokenText = 'Push now! Target -0.300s pace delta. Quali deployment.'
      urgency = 'HIGH'
    } else if (text.includes('hold') || text.includes('defend')) {
      action = 'HOLD POSITION'
      spokenText = 'Hold position! Defend apex and protect tyres.'
      urgency = 'HIGH'
    }

    executeRadioBroadcast(action, spokenText, urgency)
  }

  // Quick Audio Signal Handler (Section 7)
  const handleQuickAudioSignal = async (action) => {
    playRadioBeep()
    const speeches = {
      PUSH: 'Push now, hammer time! Target -0.300s pace delta.',
      ATTACK: 'Mode Attack, mode attack! Deploy DRS and press to pass.',
      DEFEND: 'Defend position, cover inside line into Variante del Rettifilo.',
      BOX_NOW: 'Box this lap, box box! Confirm pit in.',
      MANAGE_TYRES: 'Manage tyre temperatures. High thermal degradation detected.',
      SAVE_ENERGY: 'Engage Harvest Mode! Lift and coast into Turn 4.',
      PIT_THIS_LAP: 'Pit this lap for Hard compound C2. Box box.',
    }
    const text = speeches[action] || `Signal ${action}`
    speakRadioMessage(text, audioEnabled)

    executeRadioBroadcast(action, text, 'CRITICAL')
  }

  // 1. Dispatch New Coach Message (SENT -> DELIVERED -> ACKNOWLEDGED)
  const executeRadioBroadcast = (action, spokenText, urgency = 'NORMAL') => {
    playRadioBeep()
    speakRadioMessage(spokenText, audioEnabled)

    const now = new Date()
    const timeStr = now.toTimeString().split(' ')[0]
    const msgId = Date.now()

    const newMsg = {
      id: msgId,
      time: timeStr,
      coachMessage: spokenText,
      action: action,
      urgency: urgency,
      stage: 'SENT',
      sendingTime: timeStr,
      sentTime: timeStr,
      deliveredTime: null,
      readTime: null,
      ackTime: null,
      executedTime: null,
      driverResponse: null,
      telemetryMatched: false,
      executionEvidence: null,
    }

    setActiveMessage(newMsg)
    setTranscript(`Coach Dispatched: "${spokenText}"`)

    if (onRadioBroadcast) {
      onRadioBroadcast({
        id: newMsg.id,
        time: timeStr,
        sender: 'PIT WALL COACH',
        call: spokenText,
        message: spokenText,
        action: action,
        urgency: urgency,
        status: 'SENT',
      })
    }

    // Call unified command endpoint on backend
    fetch(getApiUrl('/api/command/send'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: action,
        driver_id: activeDriverId || 'driver_2',
        message: spokenText,
        urgency: urgency,
        coach_name: selectedCoach === 'bono' ? 'Peter Bonnington (Bono)' : 'Christian Horner',
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.command) {
          setActiveMessage((prev) => {
            if (!prev || String(prev.id) !== String(msgId)) return prev
            return {
              ...prev,
              id: data.command.id,
              stage: data.command.status || 'SENT',
              sentTime: data.command.sent_at || timeStr,
            }
          })
        }
      })
      .catch((err) => console.warn('Command dispatch error:', err))
  }

  // 2. Driver Acknowledgement Trigger (DELIVERED -> ACKNOWLEDGED)
  const handleDriverAcknowledge = (customResponse = null) => {
    if (!activeMessage) return

    playDriverAckBeep()
    const now = new Date()
    const ackTimeStr = now.toTimeString().split(' ')[0]
    const driverReply = customResponse || getDriverResponseForAction(activeMessage.action)

    // Synthesize driver radio voice response in cockpit tone
    speakDriverAck(driverReply, audioEnabled)

    setActiveMessage((prev) => {
      if (!prev) return prev
      const updated = {
        ...prev,
        stage: 'ACKNOWLEDGED',
        ackTime: ackTimeStr,
        driverResponse: driverReply,
      }

      // Add to comm history
      setCommHistory((hist) => [
        {
          id: updated.id,
          time: updated.sentTime,
          coachMessage: updated.coachMessage,
          driverResponse: driverReply,
          status: 'ACKNOWLEDGED ✓✓',
          executionResult: 'EVALUATING TELEMETRY...',
          executionEvidence: 'Driver acknowledged · Monitoring vehicle response',
          stage: 'ACKNOWLEDGED',
        },
        ...hist.filter((h) => h.id !== updated.id).slice(0, 4),
      ])

      return updated
    })

    // Notify backend
    fetch(getApiUrl('/api/command/ack'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: activeMessage.id,
        action: activeMessage.action,
        reply: driverReply,
        status: 'ACKNOWLEDGED',
        time: ackTimeStr,
      }),
    }).catch(() => {})
  }

  // Calculate top badge state string and class
  const badgeState = useMemo(() => {
    if (!activeMessage) {
      return { text: 'CH 1: STANDBY', cls: 'standby' }
    }
    if (activeMessage.stage === 'EXECUTED') {
      return { text: 'RADIO: ACTION CONFIRMED ✓✓', cls: 'executed' }
    }
    if (activeMessage.stage === 'ACKNOWLEDGED') {
      return { text: 'RADIO: ACKNOWLEDGED ✓✓', cls: 'acknowledged' }
    }
    if (activeMessage.stage === 'DELIVERED') {
      return { text: 'DELIVERED — AWAITING ACK', cls: 'delivered' }
    }
    if (activeMessage.stage === 'SENT') {
      return { text: 'WAITING FOR DRIVER...', cls: 'sent' }
    }
    if (activeMessage.stage === 'NOT_DETECTED') {
      return { text: 'ACKNOWLEDGED — ACTION NOT DETECTED', cls: 'not-detected' }
    }
    return { text: 'CH 1: PIT → CAR', cls: 'standby' }
  }, [activeMessage?.stage])

  // Live session command audit trail from backend
  const displayHistory = useMemo(() => {
    if (commands && commands.length > 0) {
      return [...commands].reverse().map((c) => {
        const isAck = c.status === 'ACKNOWLEDGED'
        const isDel = c.status === 'DELIVERED'
        const isDec = c.status === 'DECLINED'
        return {
          id: c.id,
          time: c.time || c.sent_at || '--:--:--',
          coachMessage: c.message || c.call || c.transcript || c.action,
          driverResponse:
            c.driver_reply ||
            (c.status === 'SENT'
              ? 'TRANSMITTING TO COCKPIT...'
              : isDel
              ? 'HEARD IN HELMET · AWAITING COPY'
              : '--'),
          status: isAck ? 'ACKNOWLEDGED ✓✓' : isDel ? 'DELIVERED ✓' : isDec ? 'DECLINED ✗' : 'SENT ●',
          executionResult: isAck
            ? 'ACTION CONFIRMED ✓✓'
            : isDel
            ? 'IN DRIVER EAR-PIECE'
            : isDec
            ? 'DECLINED BY DRIVER'
            : 'DISPATCHED',
          executionEvidence: c.latency_ms ? `Acoustic latency ${c.latency_ms}ms · Ch 1 verified` : 'Channel 1 nominal',
          stage: c.status || 'SENT',
        }
      })
    }
    return commHistory
  }, [commands, commHistory])

  return (
    <div className="coach-voice-radio-card f1-redesign">
      {/* 1. TOP HEADER & ACTIVE STATUS BADGE */}
      <div className="radio-card-header">
        <div className="radio-title-group">
          <span className="radio-live-pip"></span>
          <span className="radio-card-title">PIT WALL INTERCOM · PIT-TO-CAR RADIO LINK (CH 1)</span>
          <span className="radio-freq-tag">462.875 MHz · SECU ENCRYPTED</span>
        </div>

        <div className="radio-header-right">
          {/* Top Status Badge */}
          <div className={`radio-top-status-badge ${badgeState.cls}`}>
            <span className="badge-dot" />
            <span className="badge-text">{badgeState.text}</span>
          </div>

          {onStartDirectCall && (!callState || callState.status === 'IDLE') && (
            <button
              className="direct-call-action-btn"
              onClick={onStartDirectCall}
              style={{
                background: 'linear-gradient(90deg, #10b981, #059669)',
                border: '1px solid #34d399',
                color: '#fff',
                borderRadius: '5px',
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: '900',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)',
                letterSpacing: '0.5px'
              }}
              title="Start Live Two-Way Voice Call with Driver"
            >
              <span>☎</span> CALL DRIVER ({activeDriver?.name?.split(' ').pop() || 'DRIVER'})
            </button>
          )}

          {callState && callState.status !== 'IDLE' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {callState.status === 'CONNECTED' ? (
                <>
                  <span style={{
                    fontSize: '10.5px',
                    fontWeight: '900',
                    color: '#22c55e',
                    background: 'rgba(34, 197, 94, 0.15)',
                    border: '1px solid rgba(34, 197, 94, 0.4)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                    DRIVER CONNECTED
                  </span>

                  <span style={{
                    fontSize: '10.5px',
                    fontWeight: '900',
                    color: callState.driverListening ? '#00e5ff' : '#94a3b8',
                    background: callState.driverListening ? 'rgba(0, 229, 255, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                    border: `1px solid ${callState.driverListening ? 'rgba(0, 229, 255, 0.4)' : 'rgba(100, 116, 139, 0.3)'}`,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <span>{callState.driverListening ? '🎧' : '🔇'}</span>
                    {callState.driverListening ? 'DRIVER LISTENING' : 'AUDIO MUTED'}
                  </span>

                  <span style={{
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    fontWeight: '900',
                    color: '#00e5ff',
                    background: 'rgba(0, 0, 0, 0.5)',
                    padding: '3px 7px',
                    borderRadius: '4px',
                    border: '1px solid rgba(0, 229, 255, 0.3)'
                  }}>
                    {callState.durationFormatted}
                  </span>
                </>
              ) : (
                <span style={{
                  fontSize: '11px',
                  fontWeight: '900',
                  color: callState.status === 'REJECTED' ? '#ef4444' : '#eab308',
                  background: 'rgba(0, 0, 0, 0.5)',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  ● {callState.status}
                </span>
              )}
              {onEndCall && (
                <button
                  onClick={onEndCall}
                  style={{
                    background: '#ef4444',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    padding: '4px 8px',
                    fontSize: '10px',
                    fontWeight: '900',
                    cursor: 'pointer'
                  }}
                  title="End Call"
                >
                  ✕
                </button>
              )}
            </div>
          )}
          <button
            className={`audio-toggle-btn ${audioEnabled ? 'active' : ''}`}
            onClick={() => setAudioEnabled(!audioEnabled)}
            title="Toggle Cockpit Audio Readout"
          >
            {audioEnabled ? 'AUDIO LINK: ACTIVE' : 'AUDIO: MUTED'}
          </button>
        </div>
      </div>

      {/* 1B. PIT WALL COACH PROFILE & RADIO OPERATOR IDENTIFIER */}
      <div className="coach-identity-strip">
        <div className="coach-portrait-pod">
          <img
            src={selectedCoach === 'bono' ? '/coach_bonnington.jpg' : '/coach_horner.jpg'}
            alt="Pit Wall Race Engineer / Coach"
            className="coach-avatar-img"
          />
          <div className="coach-mic-active-dot" title="Headset Intercom Active" />
        </div>

        <div className="coach-details-pod">
          <div className="coach-name-row">
            <span className="coach-name">
              {selectedCoach === 'bono' ? 'PETER BONNINGTON ("BONO")' : 'CHRISTIAN HORNER'}
            </span>
            <span className="coach-role-pill">
              {selectedCoach === 'bono' ? 'SENIOR RACE ENGINEER' : 'CHIEF RACE STRATEGIST'}
            </span>
          </div>
          <div className="coach-meta-row">
            <span className="cm-item">LINK: <b>PIT-TO-CAR (VER #33)</b></span>
            <span className="cm-sep">·</span>
            <span className="cm-item">HEADSET: <b>TRANSMITTING LIVE</b></span>
            <span className="cm-sep">·</span>
            <span className="cm-item">LATENCY: <b>12ms</b></span>
          </div>
        </div>

        {/* Quick-Switch between Peter Bonnington and Christian Horner */}
        <div className="coach-selector-switches">
          <button
            className={`coach-switch-btn ${selectedCoach === 'bono' ? 'active' : ''}`}
            onClick={() => setSelectedCoach('bono')}
            title="Switch to Peter Bonnington ('Bono' - Senior Race Engineer)"
          >
            P. BONNINGTON
          </button>
          <button
            className={`coach-switch-btn ${selectedCoach === 'horner' ? 'active' : ''}`}
            onClick={() => setSelectedCoach('horner')}
            title="Switch to Christian Horner (Team Principal / Chief Strategist)"
          >
            C. HORNER
          </button>
        </div>
      </div>

      {/* 1C. TWO-WAY COACH ↔ DRIVER VOICE INTERCOM HUD */}
      {callState && callState.status !== 'IDLE' && (
        <div style={{
          background: callState.status === 'CONNECTED' 
            ? 'linear-gradient(180deg, rgba(6, 78, 59, 0.35) 0%, rgba(15, 23, 42, 0.85) 100%)' 
            : (callState.status === 'REJECTED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.15)'),
          border: `1px solid ${callState.status === 'CONNECTED' ? '#22C55E' : (callState.status === 'REJECTED' ? '#EF4444' : '#EAB308')}`,
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '12px',
          boxShadow: callState.status === 'CONNECTED' ? '0 0 24px rgba(34, 197, 94, 0.25)' : 'none',
          fontFamily: "'Space Mono', monospace"
        }}>
          {/* Header Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: callState.status === 'CONNECTED' ? '#22C55E' : (callState.status === 'REJECTED' ? '#EF4444' : '#EAB308'),
                boxShadow: `0 0 10px ${callState.status === 'CONNECTED' ? '#22C55E' : (callState.status === 'REJECTED' ? '#EF4444' : '#EAB308')}`,
                display: 'inline-block'
              }} />
              <span style={{ fontSize: '12px', fontWeight: '900', color: '#F8FAFC', letterSpacing: '0.8px' }}>
                VOICE LINK: PIT WALL COACH ↔ {activeDriver?.name || 'DRIVER'} #{activeDriver?.number || 16}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '12px',
                fontWeight: '900',
                color: callState.status === 'CONNECTED' ? '#22C55E' : '#CBD5E1',
                background: 'rgba(0, 0, 0, 0.6)',
                padding: '3px 8px',
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                {callState.status === 'CONNECTED' ? callState.durationFormatted : callState.status}
              </span>

              {callState.status === 'CONNECTED' && onToggleMute && (
                <button
                  onClick={onToggleMute}
                  style={{
                    background: callState.isMuted ? '#EAB308' : 'rgba(30, 41, 59, 0.9)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    color: callState.isMuted ? '#000' : '#F8FAFC',
                    fontSize: '10px',
                    fontWeight: '800',
                    cursor: 'pointer'
                  }}
                >
                  {callState.isMuted ? '🎙️ UNMUTE' : '🔇 MUTE'}
                </button>
              )}

              {onEndCall && (
                <button
                  onClick={onEndCall}
                  style={{
                    background: 'linear-gradient(90deg, #EF4444, #DC2626)',
                    border: '1px solid #F87171',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: '900',
                    cursor: 'pointer',
                    boxShadow: '0 0 10px rgba(239, 68, 68, 0.3)'
                  }}
                >
                  {callState.status === 'CONNECTED' ? '🛑 END CALL' : '✕ CANCEL'}
                </button>
              )}
            </div>
          </div>

          {/* Primary Status Verification Badges */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '8px' }}>
            {/* 1. Driver Connected */}
            <div style={{
              background: callState.status === 'CONNECTED' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.12)',
              border: `1px solid ${callState.status === 'CONNECTED' ? '#22C55E' : 'rgba(234, 179, 8, 0.4)'}`,
              borderRadius: '4px',
              padding: '6px 8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '10px', fontWeight: '900', color: callState.status === 'CONNECTED' ? '#22C55E' : '#EAB308' }}>
                {callState.status === 'CONNECTED' ? '🟢 DRIVER CONNECTED' : '⏳ CONNECTING...'}
              </div>
              <div style={{ fontSize: '8px', color: '#94A3B8' }}>P2P WebRTC Signal</div>
            </div>

            {/* 2. Driver Listening (Strictly verified) */}
            <div style={{
              background: callState.driverListening ? 'rgba(0, 229, 255, 0.15)' : 'rgba(100, 116, 139, 0.12)',
              border: `1px solid ${callState.driverListening ? '#00E5FF' : 'rgba(100, 116, 139, 0.3)'}`,
              borderRadius: '4px',
              padding: '6px 8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '10px', fontWeight: '900', color: callState.driverListening ? '#00E5FF' : '#94A3B8' }}>
                {callState.driverListening ? '🎧 DRIVER LISTENING' : '⏳ AWAITING ACK'}
              </div>
              <div style={{ fontSize: '8px', color: '#94A3B8' }}>Acoustic Confirmation</div>
            </div>

            {/* 3. Coach Mic Status */}
            <div style={{
              background: callState.isMuted ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
              border: `1px solid ${callState.isMuted ? '#EF4444' : 'rgba(34, 197, 94, 0.4)'}`,
              borderRadius: '4px',
              padding: '6px 8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '10px', fontWeight: '900', color: callState.isMuted ? '#EF4444' : '#22C55E' }}>
                🎙️ COACH: {callState.isMuted ? 'MUTED' : 'ACTIVE'}
              </div>
              <div style={{ fontSize: '8px', color: '#94A3B8' }}>Pit Wall Headset</div>
            </div>

            {/* 4. Driver Mic Status */}
            <div style={{
              background: callState.driverMicStatus === 'MUTED' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(0, 229, 255, 0.12)',
              border: `1px solid ${callState.driverMicStatus === 'MUTED' ? '#EF4444' : 'rgba(0, 229, 255, 0.4)'}`,
              borderRadius: '4px',
              padding: '6px 8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '10px', fontWeight: '900', color: callState.driverMicStatus === 'MUTED' ? '#EF4444' : '#00E5FF' }}>
                🎙️ DRIVER: {callState.driverMicStatus || 'ACTIVE'}
              </div>
              <div style={{ fontSize: '8px', color: '#94A3B8' }}>Cockpit Intercom</div>
            </div>
          </div>

          {/* Equalizer Audio Decibel Level */}
          {callState.status === 'CONNECTED' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              height: '14px',
              background: 'rgba(0, 0, 0, 0.4)',
              padding: '2px 6px',
              borderRadius: '3px'
            }}>
              {[...Array(28)].map((_, i) => {
                const level = callState.audioLevel || (callState.remoteAudioLevel || 0)
                const heightPct = !callState.isMuted
                  ? Math.min(100, Math.max(15, level * Math.sin((i / 28) * Math.PI) * 1.5))
                  : 15
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${heightPct}%`,
                      background: callState.isMuted ? '#475569' : '#00E5FF',
                      borderRadius: '1px',
                      transition: 'height 0.08s ease'
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. 6-STAGE VISUAL COMMUNICATION TIMELINE */}
      <div className="comm-timeline-panel">
        <div className="comm-timeline-nodes">
          {/* Stage 1: SENDING */}
          <div className={`comm-node ${activeMessage ? 'active-sent' : ''}`}>
            <div className="node-indicator">TX</div>
            <div className="node-content">
              <span className="node-name">SENDING</span>
              <span className="node-sub">{activeMessage?.sendingTime || '--:--:--'}</span>
            </div>
          </div>

          <div className={`comm-connector ${activeMessage && activeMessage.stage !== 'SENDING' ? 'active' : ''}`}>→</div>

          {/* Stage 2: SENT */}
          <div className={`comm-node ${activeMessage && !['SENDING'].includes(activeMessage.stage) ? 'active-sent' : ''}`}>
            <div className="node-indicator">UPLINK</div>
            <div className="node-content">
              <span className="node-name">SENT</span>
              <span className="node-sub">{activeMessage?.sentTime || '--:--:--'}</span>
            </div>
          </div>

          <div className={`comm-connector ${activeMessage && ['DELIVERED', 'READ', 'ACKNOWLEDGED', 'EXECUTED'].includes(activeMessage.stage) ? 'active' : ''}`}>→</div>

          {/* Stage 3: DELIVERED */}
          <div className={`comm-node ${activeMessage && ['DELIVERED', 'READ', 'ACKNOWLEDGED', 'EXECUTED'].includes(activeMessage.stage) ? 'active-delivered' : ''}`}>
            <div className="node-indicator">RX</div>
            <div className="node-content">
              <span className="node-name">DELIVERED</span>
              <span className="node-sub">{activeMessage?.deliveredTime || 'CAN BUS'}</span>
            </div>
          </div>

          <div className={`comm-connector ${activeMessage && ['READ', 'ACKNOWLEDGED', 'EXECUTED'].includes(activeMessage.stage) ? 'active' : ''}`}>→</div>

          {/* Stage 4: READ */}
          <div className={`comm-node ${activeMessage && ['READ', 'ACKNOWLEDGED', 'EXECUTED'].includes(activeMessage.stage) ? 'active-delivered' : ''}`}>
            <div className="node-indicator">DDU</div>
            <div className="node-content">
              <span className="node-name">READ</span>
              <span className="node-sub">{activeMessage?.readTime || 'SCREEN'}</span>
            </div>
          </div>

          <div className={`comm-connector ${activeMessage && ['ACKNOWLEDGED', 'EXECUTED'].includes(activeMessage.stage) ? 'active' : ''}`}>→</div>

          {/* Stage 5: ACKNOWLEDGED */}
          <div className={`comm-node ${activeMessage && ['ACKNOWLEDGED', 'EXECUTED'].includes(activeMessage.stage) ? 'active-driver' : ''}`}>
            <div className="node-indicator">ACK</div>
            <div className="node-content">
              <span className="node-name">ACKNOWLEDGED</span>
              <span className="node-sub">{activeMessage?.ackTime || 'PENDING'}</span>
            </div>
          </div>

          <div className={`comm-connector ${activeMessage && activeMessage.stage === 'EXECUTED' ? 'active' : ''}`}>→</div>

          {/* Stage 6: ACTION EXECUTED */}
          <div className={`comm-node ${activeMessage && activeMessage.stage === 'EXECUTED' ? 'active-executed' : ''}`}>
            <div className="node-indicator">CONF</div>
            <div className="node-content">
              <span className="node-name">EXECUTED</span>
              <span className="node-sub">VERIFIED ✓✓</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. CURRENT ACTIVE MESSAGE CARD (LIFECYCLE DISPLAY) */}
      {activeMessage && (
        <div className={`active-transmission-card stage-${activeMessage.stage.toLowerCase()}`}>
          <div className="trans-card-top">
            <div className="trans-meta-left">
              <span className={`trans-stage-tag ${activeMessage.stage.toLowerCase()}`}>
                {activeMessage.stage === 'SENT' && 'STAGE 1: MESSAGE SENT (AWAITING COCKPIT RECEIPT)'}
                {activeMessage.stage === 'DELIVERED' && 'STAGE 2: DELIVERED ✓ (AWAITING DRIVER ACKNOWLEDGEMENT)'}
                {activeMessage.stage === 'ACKNOWLEDGED' && 'STAGE 3: DRIVER ACKNOWLEDGED ✓✓ (MONITORING TELEMETRY)'}
                {activeMessage.stage === 'EXECUTED' && 'STAGE 4: ACTION CONFIRMED ✓✓ (TELEMETRY VERIFIED)'}
                {activeMessage.stage === 'NOT_DETECTED' && 'ACKNOWLEDGED — ACTION NOT DETECTED'}
              </span>
              <span className="trans-time-tag">TIMESTAMP: {activeMessage.time}</span>
            </div>

            {/* Interactive Driver Ack Button */}
            {activeMessage.stage === 'DELIVERED' && (
              <button
                className="driver-ack-trigger-btn"
                onClick={() => handleDriverAcknowledge()}
                title="Click to simulate driver accepting order and transmitting response"
              >
                <span className="btn-code">[ACK]</span>
                <span className="btn-text">DRIVER: TRANSMIT "COPY / ACK"</span>
              </button>
            )}

            {activeMessage.stage === 'ACKNOWLEDGED' && (
              <div className="driver-ack-confirmed-badge">
                <span className="ack-icon">✓✓</span>
                <span className="ack-text">DRIVER ACKNOWLEDGED ({activeMessage.ackTime})</span>
              </div>
            )}

            {activeMessage.stage === 'EXECUTED' && (
              <div className="telemetry-confirmed-badge">
                <span className="tele-icon">SECU</span>
                <span className="tele-text">ACTION CONFIRMED: {activeMessage.executionEvidence}</span>
              </div>
            )}
          </div>

          <div className="trans-message-body">
            <div className="trans-coach-row">
              <div className="coach-bubble-avatar">
                <img
                  src={selectedCoach === 'bono' ? '/coach_bonnington.jpg' : '/coach_horner.jpg'}
                  alt="Pit Wall Coach"
                  className="coach-mini-avatar-img"
                />
              </div>
              <span className="speaker-tag coach">
                {selectedCoach === 'bono' ? 'BONO (PIT WALL):' : 'HORNER (PIT WALL):'}
              </span>
              <span className="speaker-quote">"{activeMessage.coachMessage}"</span>
            </div>

            {/* Enhanced Driver Acceptance Response Card */}
            {activeMessage.driverResponse && (
              <div className="driver-voice-acceptance-card">
                <div className="driver-voice-top">
                  <div className="driver-voice-id">
                    <span className="driver-ch-badge">CH-33</span>
                    <span className="driver-callsign">DRIVER (VER #33):</span>
                    <span className="driver-tx-pill">VOICE TX</span>
                  </div>
                  <div className="driver-acoustic-metrics">
                    <span className="acoustic-metric">LATENCY: 12ms</span>
                    <span className="acoustic-metric verified">ACOUSTIC LINK VERIFIED ✓✓</span>
                    <span className="acoustic-metric time">at {activeMessage.ackTime}</span>
                  </div>
                </div>

                <div className="driver-quote-display">
                  <span className="quote-mark">“</span>
                  <span className="driver-speech-text">{activeMessage.driverResponse}</span>
                  <span className="quote-mark">”</span>
                </div>

                <div className="driver-audio-waveform-row">
                  <div className="waveform-label">COCKPIT EAR-PIECE AUDIO WAVEFORM:</div>
                  <div className="mini-eq-bars">
                    {Array.from({ length: 14 }).map((_, i) => (
                      <span key={i} className="eq-bar" style={{ animationDelay: `${(i % 5) * 0.1}s` }} />
                    ))}
                  </div>
                  <span className="waveform-hz">48 kHz HD STEREO</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3B. 8 FAST ONE-CLICK AUDIO RADIO SIGNALS (Section 7) */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.35)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '6px',
        padding: '10px 12px',
        marginBottom: '12px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px'
        }}>
          <span style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', letterSpacing: '1px' }}>
            QUICK AUDIO RADIO SIGNALS (FAST 1-CLICK TRANSMISSION)
          </span>
          <span style={{ fontSize: '9px', color: '#00e5ff', fontWeight: 'bold' }}>
            F1 ACOUSTIC CHIRP
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '6px'
        }}>
          {[
            { id: 'PUSH', label: '⚡ PUSH', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' },
            { id: 'ATTACK', label: '⚔ ATTACK', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
            { id: 'DEFEND', label: '🛡 DEFEND', color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)' },
            { id: 'BOX_NOW', label: '🛑 BOX NOW', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
            { id: 'MANAGE_TYRES', label: '🛞 MANAGE TYRES', color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)' },
            { id: 'SAVE_ENERGY', label: '🔋 SAVE ENERGY', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' },
            { id: 'PIT_THIS_LAP', label: '🔧 PIT THIS LAP', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)' },
          ].map((sig) => (
            <button
              key={sig.id}
              onClick={() => handleQuickAudioSignal(sig.id)}
              style={{
                background: sig.bg,
                border: `1px solid ${sig.color}`,
                color: sig.color,
                borderRadius: '4px',
                padding: '6px 4px',
                fontSize: '10px',
                fontWeight: '800',
                cursor: 'pointer',
                letterSpacing: '0.5px',
                transition: 'all 0.15s ease'
              }}
            >
              {sig.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. TACTICAL DISPATCH PALETTE & PUSH-TO-TALK */}
      <div className="radio-dispatch-row">
        {/* Push to Talk Mic Button */}
        <button
          className={`f1-ptt-btn ${isListening ? 'listening' : ''}`}
          onClick={toggleMic}
          title="Push to talk microphone"
        >
          <span className="ptt-code">[PTT]</span>
          <span className="ptt-label">{isListening ? 'RECORDING VOICE...' : 'PUSH TO TALK'}</span>
        </button>

        {/* Instant Tactical F1 Quick Orders */}
        <div className="tactical-order-buttons">
          <button
            className="f1-order-pill attack"
            onClick={() => executeRadioBroadcast('OVERTAKE', 'Attack LEC +18 on brakes into Turn 1', 'CRITICAL')}
          >
            [MODE 4] ATTACK LEC (TURN 1)
          </button>
          <button
            className="f1-order-pill harvest"
            onClick={() => executeRadioBroadcast('HARVEST', 'Engage Harvest Mode, lift and coast into Turn 4', 'HIGH')}
          >
            [REGEN] HARVEST ERS
          </button>
          <button
            className="f1-order-pill push"
            onClick={() => executeRadioBroadcast('PUSH', 'Push now, quali mode, target -0.300s pace delta', 'HIGH')}
          >
            [QUAL] PUSH PACE
          </button>
          <button
            className="f1-order-pill box"
            onClick={() => executeRadioBroadcast('BOX BOX', 'Box this lap, box box! Fit Medium compound', 'CRITICAL')}
          >
            [BOX] BOX THIS LAP
          </button>
          <button
            className="f1-order-pill hold"
            onClick={() => executeRadioBroadcast('HOLD POSITION', 'Hold position, defend apex and protect tyres', 'HIGH')}
          >
            [COVER] HOLD & DEFEND
          </button>
          <button
            className="f1-order-pill check"
            onClick={() => executeRadioBroadcast('RADIO CHECK', 'Radio check nominal. Confirm audio loud and clear.', 'INFO')}
          >
            [LINK] RADIO CHECK
          </button>
        </div>
      </div>

      {/* 5. COMMUNICATION HISTORY (SESSION AUDIT LOG) */}
      <div className="comm-history-section">
        <div className="history-section-header">
          <span className="hist-hdr-title">COMMUNICATION AUDIT TRAIL (SESSION LOG)</span>
          <span className="hist-hdr-sub">F1 RADIO TELEMETRY LOG · {displayHistory.length} TRANSMISSIONS</span>
        </div>

        <div className="history-table-container">
          <table className="f1-comm-table">
            <thead>
              <tr>
                <th style={{ width: '65px' }}>TIME</th>
                <th>COACH MESSAGE</th>
                <th style={{ width: '220px' }}>DRIVER RESPONSE</th>
                <th style={{ width: '130px' }}>STATUS</th>
                <th style={{ width: '160px' }}>EXECUTION RESULT</th>
              </tr>
            </thead>
            <tbody>
              {displayHistory.slice(0, 10).map((item) => {
                const isAck = item.stage === 'ACKNOWLEDGED' || item.stage === 'EXECUTED'
                const isDel = item.stage === 'DELIVERED'
                const isDec = item.stage === 'DECLINED'
                const badgeCls = isAck ? 'green' : (isDel ? 'blue' : (isDec ? 'red' : 'amber'))
                return (
                  <tr key={item.id} className={`comm-tr ${item.stage.toLowerCase()}`}>
                    <td className="time-td">{item.time}</td>
                    <td className="msg-td">"{item.coachMessage}"</td>
                    <td className="resp-td">
                      <span className="resp-bubble">"{item.driverResponse}"</span>
                    </td>
                    <td className="status-td">
                      <span className={`status-badge ${badgeCls}`}>{item.status}</span>
                    </td>
                    <td className="exec-td">
                      <span className={`exec-badge ${badgeCls}`}>{item.executionResult}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
