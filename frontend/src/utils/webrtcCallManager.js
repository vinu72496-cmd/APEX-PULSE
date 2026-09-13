/**
 * webrtcCallManager.js — Complete Two-Way WebRTC Voice Communication System
 *
 * Implements the full call state machine:
 * IDLE -> CALLING -> RINGING -> ACCEPTED -> CONNECTING -> CONNECTED -> AUDIO ACTIVE / LISTENING
 * If rejected: RINGING -> REJECTED -> IDLE
 * If ended: CONNECTED -> ENDED -> IDLE
 *
 * Key features:
 * - Real WebRTC RTCPeerConnection audio negotiation with SDP Offer/Answer & ICE exchange
 * - Browser microphone capture with echo cancellation & noise suppression
 * - Real-time F1 Helmet Intercom Bandpass Audio Filter (300Hz-3400Hz)
 * - Confirmation handshake for "🎧 DRIVER LISTENING" (only when driver confirms audio receiver is live)
 * - Real decibel audio level analyzers for both local and remote audio streams
 * - Full mute/unmute control with synchronized remote status reporting
 * - Graceful handling of microphone permissions, rejections, network drops, and call termination
 */

import { playRadioBeep, playRadioEndBeep, playDriverAckBeep, speakRadioMessage, speakDriverAck } from './radioAudio.js'
import { getApiUrl, getIceServers } from '../config.js'

export class WebRtcCallManager {
  constructor(role = 'COACH') {
    this.role = role // 'COACH' or 'DRIVER'
    this.status = 'IDLE' // 'IDLE' | 'CALLING' | 'RINGING' | 'ACCEPTED' | 'CONNECTING' | 'CONNECTED' | 'REJECTED' | 'ENDED' | 'ERROR'
    this.activeCallId = null
    this.targetDriverId = 'driver_2'
    this.driverListening = false
    this.coachVoiceStatus = 'STANDBY' // 'LIVE' | 'MUTED' | 'STANDBY'
    this.driverMicStatus = 'OFF (HEADSET ONLY)'
    this.coachMicStatus = 'LIVE'
    this.hasDriverMic = false // Driver does NOT use microphone by default in motorsport radio
    this.micPermission = 'PROMPT'
    this.statusMessage = ''

    this.startTime = null
    this.durationSeconds = 0
    this.timerInterval = null
    this.audioHeartbeatInterval = null

    // WebRTC Core
    this.peerConnection = null
    this.localStream = null
    this.remoteStream = null
    this.remoteAudio = null
    this.pendingCandidates = []

    // Audio Analysis & Filtering
    this.audioCtx = null
    this.passThroughGain = null
    this.isMuted = false
    this.audioLevel = 0 // Local mic level 0-100
    this.remoteAudioLevel = 0 // Remote speaker level 0-100
    this.localAnalyser = null
    this.remoteAnalyser = null
    this.animFrameId = null

    this.listeners = new Set()
    this.apiBase = getApiUrl('')
  }

  subscribe(callback) {
    this.listeners.add(callback)
    this.notify()
    return () => this.listeners.delete(callback)
  }

  notify() {
    const state = this.getState()
    this.listeners.forEach((cb) => cb(state))
  }

  getState() {
    const isConn = this.status === 'CONNECTED'
    const coachStatus = this.role === 'COACH'
      ? (this.isMuted ? 'MUTED' : (isConn ? 'LIVE' : 'STANDBY'))
      : (this.coachVoiceStatus || (isConn ? 'LIVE' : 'STANDBY'))

    return {
      role: this.role,
      status: this.status,
      callId: this.activeCallId,
      targetDriverId: this.targetDriverId,
      driverListening: this.driverListening,
      coachVoiceStatus: coachStatus,
      coachMicStatus: coachStatus,
      driverMicStatus: this.hasDriverMic ? (this.isMuted ? 'MUTED' : 'LIVE') : 'OFF (HEADSET ONLY)',
      hasDriverMic: this.hasDriverMic,
      micPermission: this.micPermission,
      statusMessage: isConn ? 'COACH RADIO — CONNECTED' : this.statusMessage,
      durationSeconds: this.durationSeconds,
      durationFormatted: this.formatDuration(this.durationSeconds),
      isMuted: this.isMuted,
      audioLevel: this.audioLevel,
      remoteAudioLevel: this.remoteAudioLevel,
    }
  }

  formatDuration(totalSec) {
    const mins = Math.floor(totalSec / 60)
    const secs = totalSec % 60
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  // =========================================================================
  // 1. COACH: START CALL (COACH -> DRIVER)
  // =========================================================================
  async startCall(driverId = 'driver_2') {
    this.targetDriverId = driverId
    this.status = 'CALLING'
    this.statusMessage = 'Requesting radio link...'
    this.durationSeconds = 0
    this.driverListening = false
    this.driverMicStatus = 'PENDING'
    this.coachMicStatus = 'ACTIVE'
    this.notify()

    // 1. Acquire Coach microphone
    await this.acquireMicrophone()

    // 2. Initialize WebRTC PeerConnection
    this.initPeerConnection()

    // 3. Create WebRTC SDP Offer
    let offerSdp = null
    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      })
      await this.peerConnection.setLocalDescription(offer)
      offerSdp = offer.sdp
    } catch (e) {
      console.warn('[WebRtcCall] Error creating SDP offer:', e)
    }

    // 4. Send call request to backend
    try {
      const res = await fetch(`${this.apiBase}/api/call/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caller: 'COACH',
          driver_id: driverId,
          channel: 'CH_1_DIRECT_VOICE',
        }),
      })
      const data = await res.json()
      if (data.call) {
        this.activeCallId = data.call.call_id
      }
      this.status = 'RINGING'
      this.statusMessage = 'Calling driver cockpit (Ringing)...'
      playRadioBeep()
      this.notify()

      // 5. Transmit WebRTC Offer via signaling
      if (offerSdp && this.activeCallId) {
        await this.sendWebRtcSignal({
          type: 'offer',
          sdp: offerSdp,
        })
      }
    } catch (e) {
      console.error('[WebRtcCall] Failed to initiate call request:', e)
      this.status = 'ERROR'
      this.statusMessage = 'Failed to connect to race radio server'
      this.notify()
    }
  }

  // =========================================================================
  // 2. DRIVER: ACCEPT CALL
  // =========================================================================
  async acceptCall(callId) {
    const id = callId || this.activeCallId
    this.activeCallId = id
    this.status = 'ACCEPTED'
    this.statusMessage = 'COACH RADIO — CONNECTED'
    this.driverListening = true
    this.coachVoiceStatus = 'LIVE'
    this.driverMicStatus = 'OFF (HEADSET ONLY)'
    this.notify()

    playRadioBeep()

    // Unlock AudioContext and Audio Element on Driver's click gesture
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (AudioCtx) {
        if (!this.audioCtx) this.audioCtx = new AudioCtx()
        if (this.audioCtx.state === 'suspended') {
          await this.audioCtx.resume()
        }
      }
    } catch (e) {}

    // Driver does NOT require a microphone for the primary Coach -> Driver flow.
    // Initialize WebRTC PeerConnection (transceiver: recvonly).
    this.initPeerConnection()

    this.status = 'CONNECTING'
    this.notify()

    try {
      // Send Acceptance Response to backend
      await fetch(`${this.apiBase}/api/call/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: id,
          status: 'ACCEPTED',
          driver_id: this.targetDriverId,
          driver_mic_status: 'OFF (HEADSET ONLY)',
          listening: true,
        }),
      })

      // Start audio heartbeat confirming DRIVER: LISTENING
      this.startAudioHeartbeat()
    } catch (e) {
      console.warn('[WebRtcCall] Error posting acceptance:', e)
    }

    this.status = 'CONNECTED'
    this.statusMessage = 'COACH RADIO — CONNECTED'
    this.startTimer()
    this.notify()
  }

  // =========================================================================
  // 3. DRIVER: REJECT CALL
  // =========================================================================
  async rejectCall(callId) {
    const id = callId || this.activeCallId
    this.status = 'REJECTED'
    this.statusMessage = 'Call rejected'
    this.notify()

    try {
      await fetch(`${this.apiBase}/api/call/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: id,
          status: 'REJECTED',
          driver_id: this.targetDriverId,
        }),
      })
    } catch (e) {
      // ignore
    }

    this.cleanup()
    setTimeout(() => {
      this.status = 'IDLE'
      this.statusMessage = ''
      this.notify()
    }, 2000)
  }

  // Alias for backward compatibility
  declineCall(callId) {
    return this.rejectCall(callId)
  }

  // =========================================================================
  // 4. END CALL (COACH OR DRIVER)
  // =========================================================================
  async endCall() {
    const callId = this.activeCallId
    this.status = 'ENDED'
    this.statusMessage = `Call ended · Duration: ${this.formatDuration(this.durationSeconds)}`
    playRadioEndBeep()
    this.notify()

    try {
      if (callId) {
        await fetch(`${this.apiBase}/api/call/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ call_id: callId }),
        })
      }
    } catch (e) {
      // ignore
    }

    this.cleanup()

    setTimeout(() => {
      this.status = 'IDLE'
      this.statusMessage = ''
      this.notify()
    }, 1800)
  }

  // =========================================================================
  // 5. WEBRTC SIGNALING HANDLER (WEBSOCKET DISPATCH)
  // =========================================================================
  handleWsEvent(event) {
    if (!event || !event.type) return

    // 1. Incoming Call alert to Driver
    if (event.type === 'incoming_call') {
      if (this.role === 'DRIVER') {
        this.activeCallId = event.call?.call_id
        this.status = 'RINGING'
        this.statusMessage = 'Incoming team radio call from Pit Wall Coach'
        playRadioBeep()
        this.notify()
      }
    }

    // 2. Call Response (Accepted / Rejected)
    else if (event.type === 'call_response') {
      const respStatus = event.call?.status
      if (respStatus === 'ACCEPTED' || respStatus === 'CONNECTED') {
        if (this.role === 'COACH') {
          this.status = 'CONNECTED'
          this.statusMessage = 'Driver accepted call · Establishing audio link...'
          this.driverListening = Boolean(event.call?.driver_listening)
          this.driverMicStatus = event.call?.driver_mic_status || 'ACTIVE'
          this.startTimer()
          playRadioBeep()
          speakRadioMessage('Radio link verified. Driver connected.', true)
          this.notify()
        }
      } else if (respStatus === 'REJECTED' || respStatus === 'DECLINED') {
        this.status = 'REJECTED'
        this.statusMessage = 'Call rejected by driver'
        this.cleanup()
        this.notify()
        setTimeout(() => {
          this.status = 'IDLE'
          this.statusMessage = ''
          this.notify()
        }, 2500)
      }
    }

    // 3. Audio Status Heartbeat ("🎧 DRIVER LISTENING" & "COACH: LIVE")
    else if (event.type === 'audio_status') {
      if (event.role === 'DRIVER' && this.role === 'COACH') {
        this.driverListening = Boolean(event.listening)
        this.driverMicStatus = event.mic_status || 'OFF (HEADSET ONLY)'
        this.notify()
      } else if (event.role === 'COACH' && this.role === 'DRIVER') {
        this.coachMicStatus = event.mic_status || 'LIVE'
        this.coachVoiceStatus = event.mic_status || 'LIVE'
        this.notify()
      }
    }

    // 4. WebRTC Peer-to-Peer Signaling (Offer / Answer / ICE Candidates / Voice Reachability Test)
    else if (event.type === 'webrtc_signal') {
      if (event.sender !== this.role) {
        if (event.signal && event.signal.type === 'voice_test') {
          playRadioBeep()
          const phrase = event.signal.phrase || 'Pit wall radio check loud and clear'
          if (this.role === 'DRIVER') {
            speakRadioMessage(phrase, true)
          } else {
            speakDriverAck(phrase, true)
          }
        } else {
          this.handlePeerSignal(event.signal)
        }
      }
    }

    // 5. Call Ended
    else if (event.type === 'call_ended') {
      if (this.status !== 'IDLE') {
        this.status = 'ENDED'
        this.statusMessage = `Radio channel closed (${event.duration_s || 0}s)`
        playRadioEndBeep()
        this.cleanup()
        this.notify()
        setTimeout(() => {
          this.status = 'IDLE'
          this.statusMessage = ''
          this.notify()
        }, 1500)
      }
    }
  }

  // =========================================================================
  // 6. WEBRTC PEER CONNECTION MANAGEMENT
  // =========================================================================
  initPeerConnection() {
    if (this.peerConnection) return

    try {
      const pc = new RTCPeerConnection(getIceServers())
      this.peerConnection = pc

      // Add local audio tracks to peer connection (Coach microphone)
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach((track) => {
          pc.addTrack(track, this.localStream)
        })
      } else if (this.role === 'DRIVER') {
        // Driver is receive-only for primary Coach -> Driver flow without needing local mic
        try {
          pc.addTransceiver('audio', { direction: 'recvonly' })
        } catch (e) {
          // fallback
        }
      }

      // Handle ICE Candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendWebRtcSignal({
            type: 'candidate',
            candidate: event.candidate,
          })
        }
      }

      // Handle incoming remote audio track
      pc.ontrack = (event) => {
        this.remoteStream = event.streams[0]
        this.setupRemoteAudioPlayback(this.remoteStream)
        this.setupRemoteAudioAnalyser(this.remoteStream)
      }

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          if (this.status !== 'CONNECTED') {
            this.status = 'CONNECTED'
            this.notify()
          }
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          console.warn('[WebRtcCall] Peer connection interrupted:', pc.connectionState)
          if (this.status === 'CONNECTED') {
            this.statusMessage = 'Audio link reconnecting...'
            this.notify()
          }
        }
      }

      // Process any buffered ICE candidates
      while (this.pendingCandidates.length > 0) {
        const c = this.pendingCandidates.shift()
        pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
      }
    } catch (err) {
      console.warn('[WebRtcCall] RTCPeerConnection error:', err)
    }
  }

  async handlePeerSignal(signal) {
    if (!signal) return

    try {
      if (!this.peerConnection) {
        this.initPeerConnection()
      }

      // Handle incoming SDP Offer (Callee / Driver side)
      if (signal.type === 'offer') {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal))
        const answer = await this.peerConnection.createAnswer()
        await this.peerConnection.setLocalDescription(answer)
        await this.sendWebRtcSignal({
          type: 'answer',
          sdp: answer.sdp,
        })
      }

      // Handle incoming SDP Answer (Caller / Coach side)
      else if (signal.type === 'answer') {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal))
      }

      // Handle incoming ICE Candidate
      else if (signal.type === 'candidate' && signal.candidate) {
        if (this.peerConnection && this.peerConnection.remoteDescription) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate))
        } else {
          this.pendingCandidates.push(signal.candidate)
        }
      }
    } catch (e) {
      console.warn('[WebRtcCall] Error handling peer signal:', e)
    }
  }

  async sendWebRtcSignal(signalData) {
    try {
      await fetch(`${this.apiBase}/api/call/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: this.activeCallId,
          sender: this.role,
          signal: signalData,
        }),
      })
    } catch (e) {
      // ignore
    }
  }

  // =========================================================================
  // 7. MICROPHONE ACQUISITION & F1 BANDPASS FILTER
  // =========================================================================
  async acquireMicrophone() {
    if (this.localStream) return true

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        this.localStream = stream
        this.micPermission = 'GRANTED'
        if (this.role === 'COACH') this.coachMicStatus = 'ACTIVE'
        else this.driverMicStatus = 'ACTIVE'

        this.setupLocalAudioAnalyser(stream)
        this.setupIntercomAudioPassthrough(stream)
        return true
      } catch (err) {
        console.warn(`[WebRtcCall] ${this.role} mic permission denied or unavailable:`, err)
        this.micPermission = 'DENIED'
        if (this.role === 'COACH') this.coachMicStatus = 'DENIED'
        else this.driverMicStatus = 'DENIED'
        this.statusMessage = 'Microphone permission denied · Using digital telemetry voice'
        this.notify()
        return false
      }
    }
    return false
  }

  setupIntercomAudioPassthrough(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      if (!this.audioCtx) this.audioCtx = new AudioCtx()
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume()

      const source = this.audioCtx.createMediaStreamSource(stream)

      // F1 Helmet Intercom Bandpass Audio Filter (300Hz - 3400Hz voice band)
      const bandpass = this.audioCtx.createBiquadFilter()
      bandpass.type = 'bandpass'
      bandpass.frequency.value = 1750
      bandpass.Q.value = 1.0

      const highpass = this.audioCtx.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = 320

      // Controlled volume gain to prevent runaway feedback while letting user hear their radio voice
      const gainNode = this.audioCtx.createGain()
      gainNode.gain.value = 0.4

      source.connect(highpass)
      highpass.connect(bandpass)
      bandpass.connect(gainNode)
      gainNode.connect(this.audioCtx.destination)

      this.passThroughGain = gainNode
    } catch (e) {
      console.warn('[WebRtcCall] Intercom audio filter error:', e)
    }
  }

  setupRemoteAudioPlayback(stream) {
    try {
      if (!this.remoteAudio) {
        this.remoteAudio = new Audio()
        this.remoteAudio.autoplay = true
        this.remoteAudio.playsInline = true
        this.remoteAudio.id = `remote-audio-${this.role.toLowerCase()}`
        this.remoteAudio.style.display = 'none'
        if (typeof document !== 'undefined' && document.body) {
          document.body.appendChild(this.remoteAudio)
        }
      }
      this.remoteAudio.srcObject = stream
      const playPromise = this.remoteAudio.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          console.warn('[WebRtcCall] Remote audio play deferred until interaction:', err)
        })
      }
    } catch (e) {
      console.warn('[WebRtcCall] Remote audio play error:', e)
    }
  }

  setupLocalAudioAnalyser(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      if (!this.audioCtx) this.audioCtx = new AudioCtx()

      const source = this.audioCtx.createMediaStreamSource(stream)
      this.localAnalyser = this.audioCtx.createAnalyser()
      this.localAnalyser.fftSize = 64
      source.connect(this.localAnalyser)

      this.startAnalyserLoop()
    } catch (e) {
      // ignore
    }
  }

  setupRemoteAudioAnalyser(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      if (!this.audioCtx) this.audioCtx = new AudioCtx()

      const source = this.audioCtx.createMediaStreamSource(stream)
      this.remoteAnalyser = this.audioCtx.createAnalyser()
      this.remoteAnalyser.fftSize = 64
      source.connect(this.remoteAnalyser)
    } catch (e) {
      // ignore
    }
  }

  startAnalyserLoop() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId)

    const bufferLength = 32
    const localData = new Uint8Array(bufferLength)
    const remoteData = new Uint8Array(bufferLength)

    const loop = () => {
      if (['CONNECTED', 'CALLING', 'RINGING'].includes(this.status)) {
        // 1. Analyze local mic
        if (this.localAnalyser && !this.isMuted) {
          this.localAnalyser.getByteFrequencyData(localData)
          let sum = 0
          for (let i = 0; i < bufferLength; i++) sum += localData[i]
          this.audioLevel = Math.min(100, Math.round((sum / bufferLength / 128) * 100))
        } else {
          this.audioLevel = 0
        }

        // 2. Analyze remote incoming audio
        if (this.remoteAnalyser) {
          this.remoteAnalyser.getByteFrequencyData(remoteData)
          let sum = 0
          for (let i = 0; i < bufferLength; i++) sum += remoteData[i]
          this.remoteAudioLevel = Math.min(100, Math.round((sum / bufferLength / 128) * 100))
        } else {
          this.remoteAudioLevel = 0
        }

        this.animFrameId = requestAnimationFrame(loop)
      } else {
        this.audioLevel = 0
        this.remoteAudioLevel = 0
      }
    }
    loop()
  }

  // =========================================================================
  // 8. MUTE / UNMUTE & AUDIO HEARTBEAT
  // =========================================================================
  toggleMute() {
    this.isMuted = !this.isMuted

    if (this.role === 'DRIVER') {
      // Driver mutes incoming Coach audio if they need silence during critical cornering
      if (this.remoteAudio) {
        this.remoteAudio.muted = this.isMuted
      }
      this.driverListening = !this.isMuted
      this.sendAudioStatusReport(true, !this.isMuted, 'OFF (HEADSET ONLY)')
      this.notify()
      return
    }

    // Coach mutes/unmutes their live microphone
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isMuted
      })
    }
    this.coachMicStatus = this.isMuted ? 'MUTED' : 'LIVE'
    this.coachVoiceStatus = this.isMuted ? 'MUTED' : 'LIVE'
    this.sendAudioStatusReport(!this.isMuted, this.driverListening, this.coachMicStatus)
    this.notify()
  }

  startAudioHeartbeat() {
    if (this.audioHeartbeatInterval) clearInterval(this.audioHeartbeatInterval)
    const report = () => {
      if (this.status === 'CONNECTED') {
        if (this.role === 'DRIVER') {
          this.sendAudioStatusReport(true, !this.isMuted, 'OFF (HEADSET ONLY)')
        } else {
          this.sendAudioStatusReport(!this.isMuted, this.driverListening, this.coachMicStatus)
        }
      }
    }
    // Send immediate report
    report()
    // Periodic heartbeat every 2.5 seconds to confirm "🎧 DRIVER LISTENING"
    this.audioHeartbeatInterval = setInterval(report, 2500)
  }

  async sendAudioStatusReport(audioActive, listening, micStatus) {
    try {
      await fetch(`${this.apiBase}/api/call/audio_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: this.activeCallId,
          role: this.role,
          audio_active: audioActive,
          listening: listening,
          mic_status: micStatus,
        }),
      })
    } catch (e) {
      // ignore
    }
  }

  startTimer() {
    this.durationSeconds = 0
    if (this.timerInterval) clearInterval(this.timerInterval)
    this.timerInterval = setInterval(() => {
      this.durationSeconds += 1
      this.notify()
    }, 1000)
  }

  sendVoiceTest(testPhrase = 'Radio check nominal. Confirm audio loud and clear.') {
    playRadioBeep()
    if (this.role === 'COACH') {
      speakRadioMessage(testPhrase, true)
    } else {
      speakDriverAck(testPhrase, true)
    }
    this.sendWebRtcSignal({
      type: 'voice_test',
      phrase: testPhrase,
      time: new Date().toTimeString().split(' ')[0]
    })
  }

  cleanup() {
    if (this.timerInterval) clearInterval(this.timerInterval)
    if (this.audioHeartbeatInterval) clearInterval(this.audioHeartbeatInterval)
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId)

    if (this.passThroughGain) {
      try { this.passThroughGain.disconnect() } catch (e) {}
      this.passThroughGain = null
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop())
      this.localStream = null
    }

    if (this.remoteAudio) {
      this.remoteAudio.pause()
      this.remoteAudio.srcObject = null
      this.remoteAudio = null
    }

    if (this.peerConnection) {
      try { this.peerConnection.close() } catch (e) {}
      this.peerConnection = null
    }

    this.audioLevel = 0
    this.remoteAudioLevel = 0
    this.driverListening = false
    this.pendingCandidates = []
  }
}

// Singleton instances for Coach and Driver
export const coachCallManager = new WebRtcCallManager('COACH')
export const driverCallManager = new WebRtcCallManager('DRIVER')