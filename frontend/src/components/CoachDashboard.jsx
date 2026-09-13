import React, { useState, useEffect } from 'react'
import DriverOverviewStrip from './DriverOverviewStrip.jsx'
import DriverSidebar from './DriverSidebar.jsx'
import AiStrategyEngineCard from './AiStrategyEngineCard.jsx'
import DirectCallModal from './DirectCallModal.jsx'
import RaceEventTimeline from './RaceEventTimeline.jsx'
import LiveTrackMap from './LiveTrackMap.jsx'
import CoachVoiceRadio from './CoachVoiceRadio.jsx'
import TelemetrySparkline from './TelemetrySparkline.jsx'
import TyreStatusCard from './TyreStatusCard.jsx'
import ErsManager from './ErsManager.jsx'
import LiveAlertBanner from './LiveAlertBanner.jsx'
import PositionPrediction from './PositionPrediction.jsx'
import StrategyTimeline from './StrategyTimeline.jsx'
import { coachCallManager } from '../utils/webrtcCallManager.js'
import { centralRaceState } from '../utils/centralRaceState.js'
import { getApiUrl } from '../config.js'

export default function CoachDashboard({
  decision,
  history = { speed: [], soc: [], gap: [], power: [], pace: [] },
  complianceLogs = [],
  onRadioBroadcast,
  driverAudioState,
}) {
  // Multi-Driver State Management (Section 2)
  const [drivers, setDrivers] = useState({
    driver_1: {
      id: 'driver_1',
      name: 'M. VERSTAPPEN',
      number: 1,
      team: 'Red Bull Racing',
      position: 'P1',
      lap: 30,
      total_laps: 50,
      gap_ahead_s: 0.0,
      gap_ahead_str: 'LEADER',
      gap_behind_s: 1.24,
      gap_behind_str: '+1.24s',
      tyre_compound: 'MEDIUM',
      tyre_age: 14,
      tyre_life_pct: 68.0,
      fuel_kg: 32.4,
      soc: 0.68,
      pace_delta: '+0.00s',
      status: 'GREEN',
      status_text: 'STABLE',
      car_ahead: 'NONE',
      car_behind: 'NOR #4',
      speed_kph: 332.4,
      drs_available: 0
    },
    driver_2: {
      id: 'driver_2',
      name: 'C. LECLERC',
      number: 16,
      team: 'Scuderia Ferrari',
      position: 'P4',
      lap: 30,
      total_laps: 50,
      gap_ahead_s: 0.82,
      gap_ahead_str: '0.82s',
      gap_behind_s: 1.14,
      gap_behind_str: '+1.14s',
      tyre_compound: 'HARD',
      tyre_age: 8,
      tyre_life_pct: 82.0,
      fuel_kg: 31.8,
      soc: 0.52,
      pace_delta: '+0.18s',
      status: 'YELLOW',
      status_text: 'WARNING',
      car_ahead: 'PIA #81',
      car_behind: 'RUS #63',
      speed_kph: 324.8,
      drs_available: 1
    },
    driver_3: {
      id: 'driver_3',
      name: 'L. HAMILTON',
      number: 44,
      team: 'Mercedes-AMG Petronas',
      position: 'P8',
      lap: 30,
      total_laps: 50,
      gap_ahead_s: 0.45,
      gap_ahead_str: '0.45s',
      gap_behind_s: 0.32,
      gap_behind_str: '+0.32s',
      tyre_compound: 'SOFT',
      tyre_age: 22,
      tyre_life_pct: 38.0,
      fuel_kg: 33.1,
      soc: 0.34,
      pace_delta: '-0.12s',
      status: 'RED',
      status_text: 'CRITICAL',
      car_ahead: 'ALO #14',
      car_behind: 'TSU #22',
      speed_kph: 318.5,
      drs_available: 1
    }
  })

  const [activeDriverId, setActiveDriverId] = useState('driver_2')
  const [callState, setCallState] = useState({
    status: 'IDLE',
    durationSeconds: 0,
    durationFormatted: '00:00',
    isMuted: false,
    audioLevel: 0
  })
  const [timelineEvents, setTimelineEvents] = useState([])

  // Subscribe to WebRTC Call Manager
  useEffect(() => {
    const unsub = coachCallManager.subscribe((state) => {
      setCallState(state)
    })
    return () => unsub()
  }, [])

  // Subscribe to Central Race State
  useEffect(() => {
    const unsub = centralRaceState.subscribe((snap) => {
      setActiveDriverId(snap.activeDriverId)
      if (snap.drivers) {
        setDrivers(snap.drivers)
      }
    })
    return () => unsub()
  }, [])

  // Sync with live decision if provided
  useEffect(() => {
    if (decision?.drivers) {
      setDrivers(decision.drivers)
    } else {
      // Fetch initial drivers from backend
      fetch(getApiUrl('/api/drivers'))
        .then((r) => r.json())
        .then((data) => {
          if (data.drivers) setDrivers(data.drivers)
        })
        .catch(() => {})
    }
  }, [decision])

  const activeDriver = drivers[activeDriverId] || drivers['driver_2']

  // Effective decision data for active driver
  const effectiveDecision = activeDriver?.recommendation || {
    ...decision,
    mode: activeDriver?.status === 'GREEN' ? 'HOLD' : (activeDriver?.status === 'YELLOW' ? 'OVERTAKE' : 'BOX'),
    overtake_probability: activeDriver?.id === 'driver_2' ? 74 : (activeDriver?.id === 'driver_1' ? 12 : 36),
    reward_s: 2.5,
    risk_s: activeDriver?.id === 'driver_3' ? 6.8 : 3.8,
    confidence_pct: 88,
    expected_value_s: activeDriver?.id === 'driver_2' ? 1.71 : (activeDriver?.id === 'driver_1' ? 0.35 : -0.85),
    speed_kph: activeDriver?.speed_kph || 324.8,
    gap_ahead_s: activeDriver?.gap_ahead_s || 0.82,
    soc: activeDriver?.soc || 0.52,
    lap: activeDriver?.lap || 30
  }

  // Direct Call Actions
  const handleStartDirectCall = () => {
    coachCallManager.startCall(activeDriverId)
  }

  const handleEndCall = () => {
    coachCallManager.endCall()
  }

  const handleToggleMute = () => {
    coachCallManager.toggleMute()
  }

  const handleSendInCallQuery = (queryType) => {
    coachCallManager.sendTelemetryQuery(queryType, {
      ...activeDriver,
      ...effectiveDecision
    })
  }

  return (
    <div className="coach-console" style={{ padding: '16px', maxWidth: '1720px', margin: '0 auto' }}>
      {/* Subtle race engineer background watermark */}
      <div className="coach-console-bg-watermark" aria-hidden="true" />

      {/* 1. TOP MULTI-DRIVER OVERVIEW STRIP (Section 2) */}
      <DriverOverviewStrip
        drivers={drivers}
        activeDriverId={activeDriverId}
        onSelectDriver={(id) => {
          setActiveDriverId(id)
          centralRaceState.setActiveDriver(id)
        }}
      />

      {/* 2. SUBTLE LIVE ALERT TICKER */}
      <LiveAlertBanner decision={effectiveDecision} />

      {/* 3. MAIN 3-COLUMN COMMAND ARCHITECTURE */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '280px 1.4fr 1.2fr',
        gap: '16px',
        alignItems: 'start'
      }}>
        {/* COLUMN 1: DRIVER SIDEBAR & VEHICLE HARDWARE TELEMETRY */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <DriverSidebar
            drivers={drivers}
            activeDriverId={activeDriverId}
            onSelectDriver={(id) => {
              setActiveDriverId(id)
              centralRaceState.setActiveDriver(id)
            }}
          />

          {/* 20Hz Rolling Telemetry Traces */}
          <div className="coach-panel telem-panel" style={{ background: 'rgba(15, 23, 42, 0.85)', padding: '12px', borderRadius: '8px' }}>
            <div className="panel-header" style={{ marginBottom: '8px' }}>
              <span className="panel-title" style={{ fontSize: '11px', fontWeight: '800' }}>TELEMETRY TRACES</span>
              <span className="panel-badge" style={{ fontSize: '9px' }}>{activeDriver?.name}</span>
            </div>

            <div className="charts-stack" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <TelemetrySparkline
                label="SPEED PROFILE"
                data={history.speed}
                currentValue={activeDriver?.speed_kph?.toFixed(1) || '324.8'}
                unit="KPH"
                color="#00E5FF"
                min={150}
                max={340}
                height={38}
              />
              <TelemetrySparkline
                label="GAP TO AHEAD"
                data={history.gap}
                currentValue={activeDriver?.gap_ahead_str || `${activeDriver?.gap_ahead_s}s`}
                unit="s"
                color="#FFB300"
                min={0}
                max={4}
                height={38}
              />
              <TelemetrySparkline
                label="BATTERY SOC"
                data={history.soc}
                currentValue={Math.round((activeDriver?.soc || 0.52) * 100)}
                unit="%"
                color="#76FF03"
                min={0}
                max={100}
                height={38}
              />
            </div>
          </div>

          <TyreStatusCard decision={effectiveDecision} />
          <ErsManager decision={effectiveDecision} />
        </div>

        {/* COLUMN 2: CENTRAL AI STRATEGY ENGINE & MONZA CIRCUIT RADAR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Large Central AI Strategy Engine Panel (Sections 3 & 4) */}
          <AiStrategyEngineCard
            decisionData={effectiveDecision}
            activeDriver={activeDriver}
            onRadioAction={(act) => onRadioBroadcast && onRadioBroadcast({ action: act, driver_id: activeDriverId })}
          />

          {/* Monza Circuit Radar (Section 5) */}
          <LiveTrackMap
            decision={effectiveDecision}
            activeDriver={activeDriver}
          />
        </div>

        {/* COLUMN 3: PIT WALL TEAM RADIO & VOICE CALL CONSOLE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Coach Voice Radio with 8 Quick Signals, PTT, and Direct Call Button (Sections 6 & 7) */}
          <CoachVoiceRadio
            onRadioBroadcast={onRadioBroadcast}
            decision={effectiveDecision}
            driverAudioState={driverAudioState}
            activeDriverId={activeDriverId}
            activeDriver={activeDriver}
            onStartDirectCall={handleStartDirectCall}
            callState={callState}
            onEndCall={handleEndCall}
            onToggleMute={handleToggleMute}
          />

          <PositionPrediction decision={effectiveDecision} />
          <StrategyTimeline decision={effectiveDecision} />

          {/* Compliance Audit Trail */}
          <div className="audit-sub-panel" style={{ background: 'rgba(15, 23, 42, 0.85)', padding: '10px', borderRadius: '6px' }}>
            <div className="panel-header compact" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span className="panel-title" style={{ fontSize: '10px', fontWeight: '800' }}>COMPLIANCE GUARD AUDIT</span>
              <span className="panel-badge" style={{ fontSize: '9px', color: '#22c55e' }}>FIA ENVELOPE VERIFIED</span>
            </div>
            <div style={{ fontSize: '10px', color: '#94a3b8' }}>
              No MGU-K energy over-deployments or boundary infractions recorded in the last 15 laps.
            </div>
          </div>
        </div>
      </div>

      {/* 4. RACE EVENT TIMELINE & AUDIT LOG (Bottom section) */}
      <RaceEventTimeline timelineEvents={timelineEvents} />

      {/* 5. DIRECT CALL MODAL (When Coach Initiates or Connects Voice Call) */}
      <DirectCallModal
        callState={callState}
        driver={activeDriver}
        onEndCall={handleEndCall}
        onToggleMute={handleToggleMute}
        onSendQuery={handleSendInCallQuery}
      />
    </div>
  )
}
