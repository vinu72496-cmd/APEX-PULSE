/**
 * radioAudio.js — F1 Pit Wall Radio Sound Synthesis & Text-to-Speech Engine
 * Generates authentic two-tone F1 radio beeps, pit-to-car voice synthesis,
 * driver cockpit acknowledgment "Roger" chirps, and radio squelch static.
 */

let audioCtx = null

export function getAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return null
  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

export function playRadioBeep() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    // F1 radio opening tone 1 (1750 Hz)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(1750, now)
    gain1.gain.setValueAtTime(0.12, now)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.045)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.045)

    // F1 radio opening tone 2 (2400 Hz)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(2400, now + 0.048)
    gain2.gain.setValueAtTime(0.14, now + 0.048)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.11)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.048)
    osc2.stop(now + 0.11)
  } catch (e) {
    console.warn('AudioContext not allowed or unavailable:', e)
  }
}

export function playRadioEndBeep() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1400, now)
    gain.gain.setValueAtTime(0.08, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.04)
  } catch (e) {
    // Ignore audio errors
  }
}

/**
 * Driver Roger / Copy acknowledgment chirp played back to the coach console
 * confirming the driver heard and confirmed the message.
 */
export function playDriverAckBeep() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    // F1 driver steering wheel roger chirp: 2200 Hz -> 2600 Hz
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(2200, now)
    osc.frequency.exponentialRampToValueAtTime(2600, now + 0.06)
    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.08)
  } catch (e) {
    // Ignore audio errors
  }
}

/**
 * Generates tailored driver radio response quote based on coach tactical order.
 */
export function getDriverResponseForAction(action) {
  const upper = String(action || '').toUpperCase()
  if (upper.includes('OVERTAKE') || upper.includes('ATTACK')) {
    return 'COPY, DEPLOYING MGU-K BOOST · ATTACKING INTO TURN 1'
  }
  if (upper.includes('HARVEST') || upper.includes('LIFT')) {
    return 'COPY, LIFT AND COAST ACTIVE · RECHARGING ERS IN TURN 4'
  }
  if (upper.includes('PUSH')) {
    return 'UNDERSTOOD, HAMMER TIME · PUSHING DELTA NOW'
  }
  if (upper.includes('BOX') || upper.includes('PIT')) {
    return 'BOX BOX CONFIRMED, COMING IN THIS LAP'
  }
  if (upper.includes('HOLD') || upper.includes('DEFEND')) {
    return 'COPY, DEFENDING APEX · MANAGING TYRE TEMPS'
  }
  if (upper.includes('CHECK')) {
    return '5 BY 5 - AUDIO LOUD & CLEAR'
  }
  return 'COPY / UNDERSTOOD'
}

export function speakRadioMessage(text, enableSpeech = true, onStart = null, onEnd = null) {
  if (!enableSpeech || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (onStart) onStart()
    setTimeout(() => {
      if (onEnd) onEnd()
    }, 1500)
    return
  }

  try {
    window.speechSynthesis.cancel() // Stop any previous speech
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.12 // authentic urgent pit-wall tempo
    utterance.pitch = 0.95 // authoritative tone
    utterance.volume = 1.0

    const voices = window.speechSynthesis.getVoices()
    const preferredVoice =
      voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('UK') ||
            v.name.includes('Natural') ||
            v.name.includes('George') ||
            v.name.includes('David') ||
            v.name.includes('Male'))
      ) || voices.find((v) => v.lang.startsWith('en'))

    if (preferredVoice) utterance.voice = preferredVoice

    utterance.onstart = () => {
      if (onStart) onStart()
    }

    utterance.onend = () => {
      playRadioEndBeep()
      if (onEnd) onEnd()
    }

    utterance.onerror = () => {
      if (onEnd) onEnd()
    }

    window.speechSynthesis.speak(utterance)
  } catch (e) {
    console.warn('Speech synthesis error:', e)
    if (onStart) onStart()
    if (onEnd) onEnd()
  }
}

/**
 * Speaks driver confirmation response back over the radio channel
 */
export function speakDriverAck(replyText, enableSpeech = true) {
  playDriverAckBeep()
  if (!enableSpeech || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return
  }

  try {
    const utterance = new SpeechSynthesisUtterance(replyText)
    utterance.rate = 1.25 // rapid driver in-cockpit cadence
    utterance.pitch = 1.08 // distinct driver helmet resonance
    utterance.volume = 0.95

    const voices = window.speechSynthesis.getVoices()
    const driverVoice = voices.find(
      (v) => v.lang.startsWith('en') && (v.name.includes('US') || v.name.includes('Guy') || v.name.includes('Male'))
    ) || voices[0]

    if (driverVoice) utterance.voice = driverVoice
    window.speechSynthesis.speak(utterance)
  } catch (e) {
    // Ignore speech errors
  }
}
