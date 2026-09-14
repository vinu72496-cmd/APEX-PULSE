import { useEffect, useRef, useState, useMemo } from 'react'
import DashboardHeader from './components/DashboardHeader.jsx'
import TopNavigationBar, { DASHBOARD_SECTIONS } from './components/TopNavigationBar.jsx'
import OverviewTelemetryDashboard from './components/OverviewTelemetryDashboard.jsx'
import CentralRaceViewer from './components/CentralRaceViewer.jsx'
import InteractiveTelemetryGraph from './components/InteractiveTelemetryGraph.jsx'
import HorizontalRaceTimeline from './components/HorizontalRaceTimeline.jsx'
import LeftRaceDataPanel from './components/LeftRaceDataPanel.jsx'
import RightStrategyPanel from './components/RightStrategyPanel.jsx'
import BottomTelemetryBar from './components/BottomTelemetryBar.jsx'
import DriverTelemetryPanel from './components/DriverTelemetryPanel.jsx'
import AiOvertakeCenter from './components/AiOvertakeCenter.jsx'
import StrategyForecastPanel from './components/StrategyForecastPanel.jsx'
import DriverDashboard from './components/DriverDashboard.jsx'
import CoachView from './components/CoachView.jsx'
import LapStrategyPanel from './components/LapStrategyPanel.jsx'
import CarIntroSplash from './components/CarIntroSplash.jsx'
import SystemGuideModal from './components/SystemGuideModal.jsx'
import DecisionPipelineRibbon from './components/DecisionPipelineRibbon.jsx'
import DriverCallModal from './components/DriverCallModal.jsx'
import {
  DEMO_SCENARIOS,
  calculateOvertakeProbability,
  calculateRewardRisk,
  determineRecommendation,
  sanitizeDecisionData,
} from './utils/aiDecisionEngine.js'
import DevDebugPanel from './components/DevDebugPanel.jsx'
import { coachCallManager, driverCallManager } from './utils/webrtcCallManager.js'
import { centralRaceState, DEMO_STEPS } from './utils/centralRaceState.js'
import { getWsUrl, getApiUrl } from './config.js'
import './App.css'

const WS_URL = getWsUrl()
const MAX_HISTORY = 60

/**
 * Parses URL hash (e.g. #driver, #coach, #strategy, #telemetry, #laps, #all, #overview)
 */
const parseHashToViewMode = () => {
  if (typeof window === 'undefined') return 'overview'
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase()
  const validModes = {
    overview: 'overview',
    command: 'overview',
    live: 'overview',
    driver: 'driver',
    coach: 'coach',
    strategy: 'strategy',
    telemetry: 'telemetry',
    track: 'telemetry',
    laps: 'laps',
    all: 'all',
  }
  return validModes[hash] || 'overview'
}

export default function App() {
  const [decision, setDecision] = useState(null)
  const [connected, setConnected] = useState(false)
  
  // Persistent URL Hash Routing for Navigation & Deep Linking
  const [viewMode, setViewMode] = useState(parseHashToViewMode)
  const [isPaused, setIsPaused] = useState(false)
  const [simSpeed, setSimSpeed] = useState(1)
  const [activeScenario, setActiveScenario] = useState('LIVE')
  const [showCarIntro, setShowCarIntro] = useState(true)
  const [isGuideOpen, setIsGuideOpen] = useState(false)
  const [isDebugOpen, setIsDebugOpen] = useState(false)
  const isPausedRef = useRef(false)
  isPausedRef.current = isPaused

  const [centralState, setCentralState] = useState(() => centralRaceState.getSnapshot())

  useEffect(() => {
    const unsub = centralRaceState.subscribe((snap) => {
      setCentralState(snap)
    })
    return () => unsub()
  }, [])

  // Synchronize browser history and hash navigation (back/forward & refresh)
  const handleNavigate = (newMode) => {
    setViewMode(newMode)
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', `#${newMode}`)
    }
  }

  useEffect(() => {
    const handleHashChange = () => {
      const mode = parseHashToViewMode()
      setViewMode(mode)
    }
    window.addEventListener('hashchange', handleHashChange)
    window.addEventListener('popstate', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('popstate', handleHashChange)
    }
  }, [])

  // Top-Level Driver Call Acceptance & Active Radio State
  const [driverCallState, setDriverCallState] = useState(() => driverCallManager.getState())
  useEffect(() => {
    const unsub = driverCallManager.subscribe((state) => {
      setDriverCallState(state)
    })
    return () => unsub()
  }, [])

  const [history, setHistory] = useState({
    speed: [],
    rpm: [],
    gear: [],
    throttle: [],
    brake: [],
    soc: [],
    gap: [],
    power: [],
    pace: [],
    tyreTemp: [],
  })
  const [complianceLogs, setComplianceLogs] = useState([])
  const [radioMessage, setRadioMessage] = useState(null)
  const [commands, setCommands] = useState([])
  const [activeCommand, setActiveCommand] = useState(null)
  const [driverAudioState, setDriverAudioState] = useState({
    connected: true,
    isHearing: false,
    hearingStatus: 'ONLINE & LISTENING',
    lastAck: null,
  })
  const wsRef = useRef(null)

  // Fetch session commands history on load
  useEffect(() => {
    fetch(getApiUrl('/api/commands'))
      .then((res) => res.json())
      .then((data) => {
        if (data && data.commands) {
          setCommands(data.commands)
          if (data.active_command) {
            setActiveCommand(data.active_command)
            setRadioMessage(data.active_command)
          }
        }
      })
      .catch((err) => console.warn('Could not fetch command history:', err))
  }, [])

  // Demo Scenario Handler
  const handleSelectScenario = (key) => {
    setActiveScenario(key)
  }

  // Determine effective decision payload (Demo Mode vs Preset scenario vs Live Telemetry)
  const effectiveDecision = useMemo(() => {
    // 1. Deterministic 9-Step Hackathon Demo Mode
    if (centralState.demoModeActive) {
      const step = centralState.currentDemoStep || DEMO_STEPS[centralState.demoStepIndex] || DEMO_STEPS[0]
      return {
        ...(decision || {}),
        lap: 30,
        current_position: step.pos,
        car_ahead: step.carAhead,
        overtake_probability: step.prob,
        action: step.action,
        gap_ahead_s: step.step >= 8 ? 2.18 : (step.step === 7 ? 0.12 : 0.82),
        sector_delta_s: parseFloat(step.delta) || -0.21,
        soc: step.step >= 8 ? 0.42 : 0.52,
        tyre_life_pct: step.step >= 8 ? 80 : 82,
        radio_message: {
          id: 900 + step.step,
          time: new Date().toTimeString().split(' ')[0],
          sender: 'PIT WALL COACH',
          call: step.radioMsg,
          action: step.action,
          urgency: 'CRITICAL',
        },
      }
    }

    // 2. Preset Stint Scenario
    if (activeScenario !== 'LIVE' && DEMO_SCENARIOS[activeScenario]?.override) {
      return {
        ...(decision || {}),
        ...DEMO_SCENARIOS[activeScenario].override,
      }
    }

    // 3. Active Target Driver Sync
    const activeDriver = centralState.activeDriver
    if (activeDriver) {
      return {
        ...(decision || {}),
        lap: decision?.lap ?? activeDriver.lap ?? 30,
        speed_kph: decision?.speed_kph ?? activeDriver.speed_kph ?? 324.8,
        soc: decision?.soc ?? activeDriver.soc ?? 0.52,
        current_position: activeDriver.posNum ?? 4,
        car_ahead: activeDriver.car_ahead ?? 'PIA #81',
        gap_ahead_s: decision?.gap_ahead_s ?? activeDriver.gap_ahead_s ?? 0.82,
        tyre_compound: activeDriver.tyre_compound ?? 'HARD',
        tyre_life_pct: activeDriver.tyre_life_pct ?? 82,
      }
    }

    return decision
  }, [activeScenario, decision, centralState.demoModeActive, centralState.demoStepIndex, centralState.activeDriverId])

  // Derive recommended action for synchronized UI highlighting
  const recommendedAction = useMemo(() => {
    if (!effectiveDecision) return 'HARVEST'
    const probData = calculateOvertakeProbability(effectiveDecision)
    const rr = calculateRewardRisk(probData.prob, { ...effectiveDecision, ersPct: probData.ersPct })
    const rec = determineRecommendation(probData.prob, rr, { ...effectiveDecision, ersPct: probData.ersPct })
    return rec.action
  }, [effectiveDecision])

  const handleRadioBroadcast = (msg) => {
    const formatted = {
      ...msg,
      status: msg.status || 'SENT',
      message: msg.call || msg.message || msg.transcript || msg.action,
      sent_at: msg.time || new Date().toTimeString().split(' ')[0],
    }
    setRadioMessage(formatted)
    setActiveCommand(formatted)
    setCommands((prev) => {
      const exists = prev.some((c) => String(c.id) === String(formatted.id))
      if (exists) return prev.map((c) => (String(c.id) === String(formatted.id) ? { ...c, ...formatted } : c))
      return [...prev.slice(-49), formatted]
    })
    if (['OVERTAKE', 'PUSH', 'BALANCE', 'HARVEST'].includes(msg.action)) {
      setDecision((prev) => (prev ? { ...prev, mode: msg.action } : prev))
    }
  }

  const handleDriverHearingChange = (evt) => {
    setDriverAudioState((prev) => ({
      ...prev,
      isHearing: evt.isHearing,
      hearingStatus: evt.status,
    }))
  }

  const handleDriverAcknowledge = (ack) => {
    const timeStr = ack.time || new Date().toTimeString().split(' ')[0]
    const ackStatus = ack.status || 'ACKNOWLEDGED'
    const replyText = ack.reply || 'COPY THAT / EXECUTING'

    setDriverAudioState((prev) => ({
      ...prev,
      isHearing: false,
      hearingStatus: 'ONLINE & LISTENING',
      lastAck: ack,
    }))

    setActiveCommand((prev) =>
      prev ? { ...prev, status: ackStatus, driver_reply: replyText, acknowledged_at: timeStr } : null
    )
    setRadioMessage((prev) =>
      prev ? { ...prev, status: ackStatus, driver_reply: replyText, acknowledged_at: timeStr } : null
    )
    setCommands((prev) =>
      prev.map((c) =>
        String(c.id) === String(ack.id)
          ? { ...c, status: ackStatus, driver_reply: replyText, acknowledged_at: timeStr }
          : c
      )
    )

    fetch(getApiUrl('/api/command/ack'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: ack.id,
        action: ack.action,
        reply: replyText,
        status: ackStatus,
        time: timeStr,
      }),
    }).catch(() => {})
  }

  const handleTogglePause = () => {
    setIsPaused((p) => !p)
  }

  const handleResetSim = () => {
    setActiveScenario('LIVE')
    setDecision((prev) => (prev ? { ...prev, lap: 30, soc: 0.67, gap_ahead_s: 0.38 } : null))
    setHistory({ speed: [], soc: [], gap: [], power: [], pace: [] })
  }

  const handleSimSpeedChange = (speed) => {
    setSimSpeed(speed)
  }

  useEffect(() => {
    let retryTimer
    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)

      ws.onclose = () => {
        setConnected(false)
        retryTimer = setTimeout(connect, 1500)
      }

      ws.onerror = () => ws.close()

      ws.onmessage = (event) => {
        if (isPausedRef.current) return
        try {
          const data = JSON.parse(event.data)
          // WebRTC Voice Call Signaling & Audio Signals Dispatch
          if (['incoming_call', 'call_response', 'call_ended', 'webrtc_signal', 'audio_status'].includes(data.type)) {
            coachCallManager.handleWsEvent(data)
            driverCallManager.handleWsEvent(data)
          }
          // Command Engine Lifecycle Dispatch
          if (data.type === 'command_update') {
            const cmd = data.command
            if (cmd) {
              setActiveCommand(cmd)
              setRadioMessage(cmd)
              setCommands((prev) => {
                const idx = prev.findIndex(
                  (c) => String(c.id) === String(cmd.id) || String(c.command_id) === String(cmd.command_id)
                )
                if (idx >= 0) {
                  const updated = [...prev]
                  updated[idx] = { ...updated[idx], ...cmd }
                  return updated
                }
                return [...prev.slice(-49), cmd]
              })
              if (cmd.status === 'ACKNOWLEDGED' || cmd.status === 'DECLINED') {
                setDriverAudioState((prev) => ({
                  ...prev,
                  lastAck: {
                    id: cmd.id,
                    reply: cmd.driver_reply,
                    status: cmd.status,
                    time: cmd.acknowledged_at || cmd.time,
                  },
                }))
              }
            }
          }

          if (data.type === 'radio_ack') {
            const ack = data.ack
            if (ack) {
              setDriverAudioState((prev) => ({
                ...prev,
                lastAck: ack,
              }))
              setActiveCommand((prev) =>
                prev && String(prev.id) === String(ack.id)
                  ? { ...prev, status: ack.status || 'ACKNOWLEDGED', acknowledged_at: ack.time, driver_reply: ack.reply }
                  : prev
              )
              setRadioMessage((prev) =>
                prev && String(prev.id) === String(ack.id)
                  ? { ...prev, status: ack.status || 'ACKNOWLEDGED', acknowledged_at: ack.time, driver_reply: ack.reply }
                  : prev
              )
              setCommands((prev) =>
                prev.map((c) =>
                  String(c.id) === String(ack.id)
                    ? { ...c, status: ack.status || 'ACKNOWLEDGED', acknowledged_at: ack.time, driver_reply: ack.reply }
                    : c
                )
              )
            }
          }

          if (data.type === 'radio_signal') {
            const sig = data.signal || data
            const formatted = {
              id: sig.id,
              sender: sig.sender || 'PIT WALL COACH',
              message: sig.speech || sig.text,
              call: sig.speech || sig.text,
              transcript: sig.speech || sig.text,
              action: sig.action,
              urgency: 'HIGH',
              status: 'SENT',
            }
            setActiveCommand(formatted)
            setRadioMessage(formatted)
            setCommands((prev) => [...prev.slice(-49), formatted])
          }

          if (data.type === 'decision' || data.mode) {
            const sanitized = sanitizeDecisionData(data)
            if (data.drivers) {
              sanitized.drivers = data.drivers
            }
            setDecision(sanitized)

            if (data.active_command) {
              setActiveCommand(data.active_command)
              setRadioMessage(data.active_command)
            } else if (data.radio_message) {
              setRadioMessage(data.radio_message)
              setActiveCommand((prev) => prev || data.radio_message)
            }

            if (data.commands && Array.isArray(data.commands) && data.commands.length > 0) {
              setCommands((prev) => {
                const map = new Map()
                prev.forEach((c) => map.set(String(c.id), c))
                data.commands.forEach((c) => map.set(String(c.id), { ...(map.get(String(c.id)) || {}), ...c }))
                return Array.from(map.values()).slice(-50)
              })
            }

            // Update rolling history buffer (last 60 ticks)
            setHistory((prev) => {
              const speedVal = data.speed_kph ?? 312
              const rpmVal = data.rpm ?? (10400 + Math.round(((speedVal % 25) * 55)))
              const gearVal = data.gear ?? (speedVal > 300 ? 8 : (speedVal > 260 ? 7 : 6))
              const throttleVal = data.throttle ?? (speedVal > 260 ? 95 : 65)
              const brakeVal = data.brake ?? 0
              const socVal = Math.round((data.soc ?? 0) * 100)
              const gapVal = Number(data.gap_ahead_s ?? data.gap_to_ahead_s ?? 0.38)
              const powerVal = Number(data.mguk_power_kw ?? 0)
              const paceVal = typeof data.sector_delta_s === 'number' ? -data.sector_delta_s : -0.214
              const tyreTempVal = Number(data.tyre_temps?.fl ?? 102)

              return {
                speed: [...(prev.speed || []).slice(-MAX_HISTORY + 1), speedVal],
                rpm: [...(prev.rpm || []).slice(-MAX_HISTORY + 1), rpmVal],
                gear: [...(prev.gear || []).slice(-MAX_HISTORY + 1), gearVal],
                throttle: [...(prev.throttle || []).slice(-MAX_HISTORY + 1), throttleVal],
                brake: [...(prev.brake || []).slice(-MAX_HISTORY + 1), brakeVal],
                soc: [...(prev.soc || []).slice(-MAX_HISTORY + 1), socVal],
                gap: [...(prev.gap || []).slice(-MAX_HISTORY + 1), gapVal],
                power: [...(prev.power || []).slice(-MAX_HISTORY + 1), powerVal],
                pace: [...(prev.pace || []).slice(-MAX_HISTORY + 1), paceVal],
                tyreTemp: [...(prev.tyreTemp || []).slice(-MAX_HISTORY + 1), tyreTempVal],
              }
            })

            // Track compliance intervention logs
            if (data.guard_intervened) {
              const now = new Date()
              const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0')
              setComplianceLogs((prev) => [
                {
                  id: Date.now() + Math.random(),
                  time: timeStr,
                  lap: data.lap ?? 30,
                  mode: data.mode ?? 'HARVEST',
                  reasons: data.guard_reasons ?? ['Configured limit exceeded'],
                },
                ...prev.slice(0, 19),
              ])
            }
          }
        } catch (e) {
          console.error('Bad WebSocket payload:', e)
        }
      }
    }

    connect()
    return () => {
      clearTimeout(retryTimer)
      wsRef.current?.close()
    }
  }, [])

  return (
    <div className="apex-app">
      {/* 0. High-Tech F1 Race Car Intro Splash */}
      {showCarIntro && (
        <CarIntroSplash
          durationMs={1200}
          onComplete={() => setShowCarIntro(false)}
        />
      )}

      {/* 0.5. Top-Level Driver Call Acceptance & Active Radio HUD Modal (Cockpit side) */}
      {viewMode !== 'coach' && (
        <DriverCallModal
          callState={driverCallState}
          onAccept={() => driverCallManager.acceptCall()}
          onDecline={() => driverCallManager.declineCall()}
          onReject={() => driverCallManager.rejectCall()}
          onEndCall={() => driverCallManager.endCall()}
          onToggleMute={() => driverCallManager.toggleMute()}
        />
      )}

      {/* ============================================================
          PERSISTENT TOP MASTHEAD:
          1. Clean F1 Command Header Bar
          2. Dedicated Persistent Top Navigation Bar
          ============================================================ */}
      <div className="apex-top-masthead">
        <DashboardHeader
          connected={connected}
          lap={effectiveDecision?.lap ?? 30}
          totalLaps={50}
          isPaused={isPaused}
          onTogglePause={handleTogglePause}
          onResetSim={handleResetSim}
          simSpeed={simSpeed}
          onSimSpeedChange={handleSimSpeedChange}
          dataQuality={connected ? 98 : 0}
          activeScenario={activeScenario}
          onSelectScenario={handleSelectScenario}
          onOpenGuide={() => setIsGuideOpen(true)}
          onOpenDebug={() => setIsDebugOpen(true)}
          demoModeActive={centralState.demoModeActive}
          demoStepIndex={centralState.demoStepIndex}
          onToggleDemoMode={() => centralRaceState.toggleDemoMode()}
          onNextDemoStep={() => centralRaceState.nextDemoStep()}
          onPrevDemoStep={() => centralRaceState.prevDemoStep()}
          activeDriverId={centralState.activeDriverId}
          onSelectDriver={(id) => centralRaceState.setActiveDriver(id)}
        />

        {/* 1.5. Persistent Horizontal Top Navigation Bar */}
        <TopNavigationBar
          currentSection={viewMode}
          onSelectSection={handleNavigate}
          onOpenGuide={() => setIsGuideOpen(true)}
          onOpenDebug={() => setIsDebugOpen(true)}
        />
      </div>

      {/* Disconnection Fallback Banner */}
      {!connected && (
        <div className="telemetry-interrupted-banner">
          <span className="banner-icon">⚠️</span>
          <span className="banner-text">DATA STREAM INTERRUPTED · Attempting reconnect to telemetry server...</span>
        </div>
      )}

      {/* Interactive System Architecture & Judge's Guide Modal */}
      <SystemGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onSelectScenario={handleSelectScenario}
      />

      {/* Real-Time Developer AI Pipeline Inspector & Bench Tester */}
      <DevDebugPanel
        isOpen={isDebugOpen}
        onClose={() => setIsDebugOpen(false)}
        decision={effectiveDecision}
        onSelectScenario={handleSelectScenario}
      />

      {/* 2. Main Dashboard Viewport */}
      <main className={`apex-viewport layout-${viewMode}`}>
        {/* ============================================================
            SECTION 1: OVERVIEW / RACE COMMAND CENTER (3-COLUMN)
            ============================================================ */}
        {['overview', 'command', 'live'].includes(viewMode) && (
          <OverviewTelemetryDashboard
            decision={effectiveDecision}
            centralState={centralState}
            onOpenGuide={() => setIsGuideOpen(true)}
            renderCommandCenter={() => (
              <div className="live-race-container">
                <DecisionPipelineRibbon
                  decision={effectiveDecision}
                  onOpenGuide={() => setIsGuideOpen(true)}
                  activeScenario={activeScenario}
                  onSelectScenario={handleSelectScenario}
                />
                <div className="race-intelligence-3col">
                  <div className="layout-col col-left">
                    <LeftRaceDataPanel 
                      decision={effectiveDecision} 
                      lap={effectiveDecision?.lap ?? 30} 
                      totalLaps={50} 
                      grid={centralState.grid}
                      activeDriverId={centralState.activeDriverId}
                      onSelectDriver={(id) => centralRaceState.setActiveDriver(id)}
                    />
                  </div>
                  <div className="layout-col col-center">
                    <CentralRaceViewer 
                      decision={effectiveDecision} 
                      lap={effectiveDecision?.lap ?? 30} 
                    />
                    <InteractiveTelemetryGraph decision={effectiveDecision} />
                    <HorizontalRaceTimeline decision={effectiveDecision} />
                  </div>
                  <div className="layout-col col-right">
                    <RightStrategyPanel 
                      decision={effectiveDecision} 
                      onSelectStrategyMode={(mode) => {
                        handleRadioBroadcast({ 
                          action: mode, 
                          call: `Switching powertrain mode to ${mode} for T1 engagement`,
                          urgency: 'HIGH'
                        })
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          />
        )}

        {/* ============================================================
            SECTION 2: DRIVER DISPLAY UNIT (MoTeC COCKPIT HUD & POV)
            ============================================================ */}
        {viewMode === 'driver' && (
          <section className="viewport-pane pane-driver">
            <div className="pane-banner">
              <span className="pane-tag">DRIVER DISPLAY UNIT</span>
              <span className="pane-desc">MoTeC Cockpit HUD · LAP {effectiveDecision?.lap ?? 30}/50</span>
            </div>
            <DriverDashboard
              decision={effectiveDecision}
              connected={connected}
              radioMessage={activeCommand || radioMessage}
              commands={commands}
              activeCommand={activeCommand}
              onAcknowledgeRadio={handleDriverAcknowledge}
              onHearingStateChange={handleDriverHearingChange}
            />
          </section>
        )}

        {/* ============================================================
            SECTION 3: PIT WALL COACH CONSOLE & TEAM RADIO
            ============================================================ */}
        {viewMode === 'coach' && (
          <section className="viewport-pane pane-coach">
            <div className="pane-banner">
              <span className="pane-tag">PIT WALL CONSOLE</span>
              <span className="pane-desc">Race Strategy & Energy Analysis · LAP {effectiveDecision?.lap ?? 30}/50</span>
            </div>
            <CoachView
              decision={effectiveDecision}
              history={history}
              complianceLogs={complianceLogs}
              commands={commands}
              activeCommand={activeCommand}
              onRadioBroadcast={handleRadioBroadcast}
              driverAudioState={driverAudioState}
            />
          </section>
        )}

        {/* ============================================================
            SECTION 4: AI STRATEGY ENGINE & OVERTAKE DEEP DIVE
            ============================================================ */}
        {viewMode === 'strategy' && (
          <div className="strategy-3col-grid">
            <section className="col-left">
              <DriverTelemetryPanel
                decision={effectiveDecision}
                recommendedAction={recommendedAction}
              />
            </section>
            <section className="col-center">
              <AiOvertakeCenter decision={effectiveDecision} />
            </section>
            <section className="col-right">
              <StrategyForecastPanel decision={effectiveDecision} />
            </section>
          </div>
        )}

        {/* ============================================================
            SECTION 5: LIVE TELEMETRY & TRACK MAP FOCUS
            ============================================================ */}
        {['telemetry', 'track'].includes(viewMode) && (
          <div className="telemetry-track-view-grid">
            <div className="layout-col col-track">
              <CentralRaceViewer 
                decision={effectiveDecision} 
                lap={effectiveDecision?.lap ?? 30} 
              />
              <HorizontalRaceTimeline decision={effectiveDecision} />
            </div>
            <div className="layout-col col-graphs">
              <InteractiveTelemetryGraph decision={effectiveDecision} history={history} />
              <DriverTelemetryPanel
                decision={effectiveDecision}
                recommendedAction={recommendedAction}
              />
            </div>
          </div>
        )}

        {/* ============================================================
            SECTION 6: 50-LAP HISTORICAL MONZA TELEMETRY & STRATEGY LOGS
            ============================================================ */}
        {viewMode === 'laps' && (
          <section className="viewport-pane pane-laps">
            <div className="pane-banner">
              <span className="pane-tag">HISTORICAL MONZA LAPS & STRATEGY</span>
              <span className="pane-desc">50-Lap Telemetry & Kaggle Dataset Overtake Logs</span>
            </div>
            <LapStrategyPanel decision={effectiveDecision} />
          </section>
        )}

        {/* ============================================================
            SECTION 7: ALL SECTIONS STACKED SEQUENTIALLY
            ============================================================ */}
        {viewMode === 'all' && (
          <div className="sequential-view-container">
            {/* 1. RACE COMMAND CENTER (3-COLUMN) */}
            <section id="section-command" className="sequential-section">
              <div className="sequential-section-header">
                <div className="seq-header-left">
                  <span className="seq-number-badge">01 / OVERVIEW</span>
                  <span className="seq-title">Race Command Center & 3-Column Intelligence</span>
                </div>
                <div className="seq-header-right">
                  <span className="seq-meta-desc">Standings Grid · 2.5D Monza Track · AI Strategy Pipeline</span>
                  <button className="seq-top-btn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑ TOP</button>
                </div>
              </div>
              <div className="sequential-section-body">
                <OverviewTelemetryDashboard
                  decision={effectiveDecision}
                  centralState={centralState}
                  onOpenGuide={() => setIsGuideOpen(true)}
                  renderCommandCenter={() => (
                    <div className="live-race-container">
                      <DecisionPipelineRibbon
                        decision={effectiveDecision}
                        onOpenGuide={() => setIsGuideOpen(true)}
                        activeScenario={activeScenario}
                        onSelectScenario={handleSelectScenario}
                      />
                      <div className="race-intelligence-3col">
                        <div className="layout-col col-left">
                          <LeftRaceDataPanel 
                            decision={effectiveDecision} 
                            lap={effectiveDecision?.lap ?? 30} 
                            totalLaps={50} 
                            grid={centralState.grid}
                            activeDriverId={centralState.activeDriverId}
                            onSelectDriver={(id) => centralRaceState.setActiveDriver(id)}
                          />
                        </div>
                        <div className="layout-col col-center">
                          <CentralRaceViewer 
                            decision={effectiveDecision} 
                            lap={effectiveDecision?.lap ?? 30} 
                          />
                          <InteractiveTelemetryGraph decision={effectiveDecision} history={history} />
                          <HorizontalRaceTimeline decision={effectiveDecision} />
                        </div>
                        <div className="layout-col col-right">
                          <RightStrategyPanel 
                            decision={effectiveDecision} 
                            onSelectStrategyMode={(mode) => {
                              handleRadioBroadcast({ 
                                action: mode, 
                                call: `Switching powertrain mode to ${mode} for T1 engagement`,
                                urgency: 'HIGH'
                              })
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                />
              </div>
            </section>

            {/* 2. DRIVER DISPLAY UNIT */}
            <section id="section-driver" className="sequential-section">
              <div className="sequential-section-header">
                <div className="seq-header-left">
                  <span className="seq-number-badge">02 / DRIVER</span>
                  <span className="seq-title">Driver Display Unit (DDU) · MoTeC Cockpit HUD</span>
                </div>
                <div className="seq-header-right">
                  <span className="seq-meta-desc">Monza Cockpit POV · Halo Horizon · Rev Bar · Call Acceptance</span>
                  <button className="seq-top-btn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑ TOP</button>
                </div>
              </div>
              <div className="sequential-section-body">
                <section className="viewport-pane pane-driver">
                  <DriverDashboard
                    decision={effectiveDecision}
                    connected={connected}
                    radioMessage={activeCommand || radioMessage}
                    commands={commands}
                    activeCommand={activeCommand}
                    onAcknowledgeRadio={handleDriverAcknowledge}
                    onHearingStateChange={handleDriverHearingChange}
                  />
                </section>
              </div>
            </section>

            {/* 3. AI STRATEGY ENGINE */}
            <section id="section-strategy" className="sequential-section">
              <div className="sequential-section-header">
                <div className="seq-header-left">
                  <span className="seq-number-badge">03 / STRATEGY</span>
                  <span className="seq-title">AI Strategy & Overtake Probability Center</span>
                </div>
                <div className="seq-header-right">
                  <span className="seq-meta-desc">Degradation Curves · DRS Gap Analysis · Undercut Simulator</span>
                  <button className="seq-top-btn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑ TOP</button>
                </div>
              </div>
              <div className="sequential-section-body">
                <div className="strategy-3col-grid">
                  <section className="col-left">
                    <DriverTelemetryPanel
                      decision={effectiveDecision}
                      recommendedAction={recommendedAction}
                    />
                  </section>
                  <section className="col-center">
                    <AiOvertakeCenter decision={effectiveDecision} />
                  </section>
                  <section className="col-right">
                    <StrategyForecastPanel decision={effectiveDecision} />
                  </section>
                </div>
              </div>
            </section>

            {/* 4. PIT WALL COACH */}
            <section id="section-coach" className="sequential-section">
              <div className="sequential-section-header">
                <div className="seq-header-left">
                  <span className="seq-number-badge">04 / COACH</span>
                  <span className="seq-title">Pit Wall Coach Console & Live Direct Call</span>
                </div>
                <div className="seq-header-right">
                  <span className="seq-meta-desc">Interactive Team Radio · 6-Stage WebRTC Voice Comms</span>
                  <button className="seq-top-btn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑ TOP</button>
                </div>
              </div>
              <div className="sequential-section-body">
                <section className="viewport-pane pane-coach">
                  <CoachView
                    decision={effectiveDecision}
                    history={history}
                    complianceLogs={complianceLogs}
                    commands={commands}
                    activeCommand={activeCommand}
                    onRadioBroadcast={handleRadioBroadcast}
                    driverAudioState={driverAudioState}
                  />
                </section>
              </div>
            </section>

            {/* 5. 50-LAP HISTORICAL LAPS */}
            <section id="section-laps" className="sequential-section">
              <div className="sequential-section-header">
                <div className="seq-header-left">
                  <span className="seq-number-badge">05 / LAPS</span>
                  <span className="seq-title">50-Lap Historical Monza Telemetry & Strategy Logs</span>
                </div>
                <div className="seq-header-right">
                  <span className="seq-meta-desc">50 Laps Sector Times · Pit Stop Deltas · Overtake History</span>
                  <button className="seq-top-btn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑ TOP</button>
                </div>
              </div>
              <div className="sequential-section-body">
                <section className="viewport-pane pane-laps">
                  <LapStrategyPanel decision={effectiveDecision} />
                </section>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* 3. Unified Bottom Status Bar */}
      <BottomTelemetryBar 
        decision={effectiveDecision} 
        radioMessage={radioMessage}
        driverAudioState={driverAudioState}
        lap={effectiveDecision?.lap ?? 30} 
        totalLaps={50} 
      />
    </div>
  )
}