import React, { useState, useEffect } from 'react'
import {
  playRadioBeep,
  playDriverAckBeep,
  speakDriverAck,
  getDriverResponseForAction,
} from '../utils/radioAudio.js'
import { getApiUrl } from '../config.js'

export default function DriverRadioBanner({
  radioMessage,
  onAcknowledge,
  onHearingStateChange,
}) {
  const [visible, setVisible] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)

  useEffect(() => {
    if (radioMessage && radioMessage.id) {
      const isAcked = radioMessage.status === 'ACKNOWLEDGED' || radioMessage.status === 'ACCEPTED'
      if (isAcked) {
        setAcknowledged(true)
        return
      }

      setVisible(true)
      setAcknowledged(false)
      setIsPlayingAudio(true)
      playRadioBeep()

      if (onHearingStateChange) {
        onHearingStateChange({ id: radioMessage.id, isHearing: true, status: 'AUDIO PLAYING IN HELMET' })
      }

      // Send immediate delivery confirmation to pit wall coach
      fetch(getApiUrl('/api/command/delivered'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: radioMessage.id }),
      }).catch(() => {})

      // Voice readout duration in driver helmet
      const audioTimer = setTimeout(() => {
        setIsPlayingAudio(false)
        if (onHearingStateChange) {
          onHearingStateChange({ id: radioMessage.id, isHearing: false, status: 'MESSAGE HEARD (AWAITING COPY)' })
        }
      }, 3500)

      return () => {
        clearTimeout(audioTimer)
      }
    }
  }, [radioMessage?.id, radioMessage?.status])

  if (!visible || !radioMessage) return null

  const urgencyClass = radioMessage.urgency?.toLowerCase() || 'normal'

  const handleAck = () => {
    setAcknowledged(true)
    playDriverAckBeep()
    const now = new Date()
    const timeStr = now.toTimeString().split(' ')[0]
    const driverReply = getDriverResponseForAction(radioMessage.action)

    speakDriverAck(driverReply, true)

    if (onAcknowledge) {
      onAcknowledge({
        id: radioMessage.id,
        action: radioMessage.action,
        reply: driverReply,
        time: timeStr,
      })
    }

    fetch(getApiUrl('/api/command/ack'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: radioMessage.id,
        action: radioMessage.action,
        reply: driverReply,
        status: 'ACKNOWLEDGED',
        time: timeStr,
      }),
    }).catch(() => {})

    setTimeout(() => setVisible(false), 3000)
  }

  return (
    <div className={`driver-radio-hud ${urgencyClass} ${acknowledged ? 'acked' : ''} ${isPlayingAudio ? 'hearing-active' : ''}`}>
      <div className="radio-hud-left">
        <div className="radio-hud-icon-wrap">
          <span className="radio-pip-dot"></span>
          <span className="radio-hud-icon">{isPlayingAudio ? '🔊' : '📻'}</span>
        </div>
        <div className="radio-hud-message-box">
          <div className="radio-hud-meta">
            <span className="radio-hud-channel">
              {isPlayingAudio ? '🔊 HELMET EAR-PIECE RECEIVING...' : 'RADIO CH 1 · PIT WALL TRANSMISSION'}
            </span>
            <span className="radio-hud-timestamp">{radioMessage.time}</span>
            <span className="driver-audio-live-indicator">● EAR-PIECE ON</span>
          </div>
          <div className="radio-hud-call">
            <strong className="radio-hud-action">[{radioMessage.action}]</strong> {radioMessage.call}
          </div>
        </div>
      </div>

      <div className="radio-hud-right">
        <button
          className={`radio-ack-btn ${acknowledged ? 'done' : ''}`}
          onClick={handleAck}
          title="Send driver copy confirmation to pit wall coach"
        >
          {acknowledged
            ? '✓ DRIVER ACKNOWLEDGED ✓✓'
            : radioMessage.action === 'RADIO CHECK'
            ? 'PRESS [LOUD & CLEAR]'
            : 'PRESS [COPY / ACKNOWLEDGE]'}
        </button>
      </div>
    </div>
  )
}
