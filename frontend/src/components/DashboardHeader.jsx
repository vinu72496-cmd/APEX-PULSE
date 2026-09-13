import React from 'react'
import { DEMO_SCENARIOS } from '../utils/aiDecisionEngine.js'
import { centralRaceState, DEMO_STEPS } from '../utils/centralRaceState.js'

/**
 * DashboardHeader — Professional F1 Pit Wall Command Bar
 *
 * Left:   APEX PULSE / RACE INTELLIGENCE + SYSTEM HEALTH
 * Center: LIVE • MONZA GP • LAP 30 / 50 • DRIVER SELECTOR
 * Right:  TRACK STATUS · DEMO MODE · SESSION CONTROLS · NAV
 */
export default function DashboardHeader({
  connected = true,
  lap = 30,
  totalLaps = 50,
  viewMode = 'live',
  onViewChange,
  isPaused = false,
  onTogglePause,
  onResetSim,
  simSpeed = 1,
  onSimSpeedChange,
  activeScenario = 'LIVE',
  onSelectScenario = () => {},
  onOpenGuide = () => {},
  onOpenDebug = () => {},
  demoModeActive = false,
  demoStepIndex = 0,
  onToggleDemoMode = () => {},
  onNextDemoStep = () => {},
  onPrevDemoStep = () => {},
  activeDriverId = 'driver_2',
  onSelectDriver = () => {},
}) {
  const currentDemoStep = DEMO_STEPS[demoStepIndex] || DEMO_STEPS[0]

  return (
    <>
      <header className="f1-command-bar">
        {/* 1. Left: Brand & Engineering Identity */}
        <div className="command-brand">
          <div className="brand-logo-lockup">
            <span className="brand-name">APEX PULSE</span>
            <span className="brand-badge-intel">RACE INTELLIGENCE</span>
          </div>

          {/* Compact System Health Bar (Telemetry, AI Engine, Driver, Coach, Stream) */}
          <div className="header-health-bar">
            <span className="health-item" title="Telemetry CAN bus stream latency">
              <span className={`health-dot ${connected ? 'green' : 'red'}`} />
              <span className="health-label">TELEMETRY {connected ? 'CONNECTED' : 'DISCONNECTED'}</span>
            </span>
            <span className="health-sep">·</span>
            <span className="health-item" title="DualModelCore & XGBoost 20Hz pipeline">
              <span className="health-dot cyan" />
              <span className="health-label">AI ENGINE ONLINE (20Hz)</span>
            </span>
            <span className="health-sep">·</span>
            <span className="health-item" title="Cockpit telemetry & acoustic latency">
              <span className="health-dot green" />
              <span className="health-label">DRIVER LINK (14ms)</span>
            </span>
            <span className="health-sep">·</span>
            <span className="health-item" title="WebRTC & Voice Radio signaling">
              <span className="health-dot green" />
              <span className="health-label">COACH LINK (LIVE)</span>
            </span>
            <span className="health-sep">·</span>
            <span className="health-item" title="Overall data stream health">
              <span className="health-dot green" />
              <span className="health-label">STREAM HEALTHY</span>
            </span>
          </div>
        </div>

        {/* 2. Center: LIVE • MONZA GP • LAP 30 / 50 • DRIVER SELECT */}
        <div className="command-session">
          <div className="session-live-pill">
            <span className="live-indicator-dot" />
            <span className="live-text">LIVE</span>
          </div>
          <span className="session-sep">•</span>
          <span className="session-gp-text">MONZA GP</span>
          <span className="session-sep">•</span>
          <div className="session-lap-counter">
            <span className="lap-lbl">LAP</span>
            <span className="lap-curr">{lap}</span>
            <span className="lap-total">/ {totalLaps}</span>
          </div>

          {/* Active Driver Selector */}
          <div className="header-driver-selector">
            <span className="driver-sel-label">TARGET:</span>
            <select
              className="driver-sel-dropdown"
              value={activeDriverId}
              onChange={(e) => onSelectDriver(e.target.value)}
              title="Select active telemetry target driver"
            >
              <option value="driver_2">LEC #16 (P4 · FERRARI)</option>
              <option value="driver_1">VER #1 (P1 · RED BULL)</option>
              <option value="driver_3">HAM #44 (P8 · MERCEDES)</option>
            </select>
          </div>
        </div>

        {/* 3. Right: Track Status, Demo Mode, Session Controls, Nav */}
        <div className="command-right">
          {/* Track Conditions Strip */}
          <div className="track-conditions-strip">
            <span className="cond-item">
              <span className="cond-k">TRACK:</span>
              <span className="cond-v green">DRY</span>
            </span>
            <span className="cond-sep">·</span>
            <span className="cond-item">
              <span className="cond-k">AIR:</span>
              <span className="cond-v">27°C</span>
            </span>
            <span className="cond-sep">·</span>
            <span className="cond-item">
              <span className="cond-k">TRACK:</span>
              <span className="cond-v hot">41.8°C</span>
            </span>
          </div>

          {/* Hackathon Deterministic Demo Mode Button */}
          <button
            className={`demo-mode-toggle-btn ${demoModeActive ? 'active' : ''}`}
            onClick={onToggleDemoMode}
            title="Toggle deterministic 9-step hackathon judging evaluation mode"
          >
            <span className="demo-flag-icon">🏁</span>
            <span>{demoModeActive ? 'DEMO ACTIVE' : 'DEMO MODE'}</span>
          </button>

          {/* Tactical Scenario Stint Selector */}
          <div className="stint-scenario-selector">
            <span className="sc-mini-label">STINT:</span>
            <select
              className="stint-select"
              value={activeScenario}
              onChange={(e) => onSelectScenario(e.target.value)}
              title="Switch deterministic scenario preset"
            >
              {Object.keys(DEMO_SCENARIOS).map((key) => (
                <option key={key} value={key}>
                  {DEMO_SCENARIOS[key].name}
                </option>
              ))}
            </select>
          </div>

          {/* Simulation Execution Controls */}
          <div className="sim-btn-group">
            <button
              className={`sim-action-btn ${isPaused ? 'paused' : 'running'}`}
              onClick={onTogglePause}
              title={isPaused ? 'Resume live simulation' : 'Freeze telemetry stream'}
            >
              {isPaused ? '▶ RUN' : '❚❚ FREEZE'}
            </button>
            <button
              className="sim-action-btn reset"
              onClick={onResetSim}
              title="Reset telemetry calibration"
            >
              ↺
            </button>
            <button
              className="sim-action-btn speed"
              onClick={() => onSimSpeedChange(simSpeed === 1 ? 2 : 1)}
              title="Toggle simulation playback speed"
            >
              {simSpeed}x
            </button>
          </div>



          {/* Real-time Pipeline Debug Inspector */}
          <button
            className="header-debug-btn"
            onClick={onOpenDebug}
            title="Open Live AI Calculation Pipeline Inspector & Bench Tester"
          >
            <span className="debug-icon">⚙️</span> DEBUG PIPELINE
          </button>

          {/* System Guide Trigger */}
          <button
            className="header-guide-btn"
            onClick={onOpenGuide}
            title="Open System Guide & Architecture Walkthrough"
          >
            <span className="guide-icon">ℹ</span> GUIDE
          </button>
        </div>
      </header>

      {/* Interactive 9-Step Hackathon Demo Mode Runner Ribbon */}
      {demoModeActive && (
        <div className="demo-mode-ribbon">
          <div className="demo-ribbon-left">
            <span className="demo-badge">🏁 HACKATHON EVALUATION MODE</span>
            <span className="demo-step-badge">
              STEP {currentDemoStep.step} OF 9
            </span>
            <span className="demo-step-title">{currentDemoStep.title}</span>
            <span className="demo-step-desc">— {currentDemoStep.desc}</span>
          </div>

          <div className="demo-ribbon-actions">
            <button
              className="demo-nav-btn prev"
              onClick={onPrevDemoStep}
              disabled={demoStepIndex === 0}
              title="Previous demonstration step"
            >
              ◀ PREV
            </button>
            <button
              className="demo-nav-btn next"
              onClick={onNextDemoStep}
              disabled={demoStepIndex === DEMO_STEPS.length - 1}
              title="Next demonstration step"
            >
              NEXT STEP ▶
            </button>
            <button
              className="demo-nav-btn exit"
              onClick={onToggleDemoMode}
              title="Exit demo mode and return to live telemetry"
            >
              ✕ EXIT DEMO
            </button>
          </div>
        </div>
      )}
    </>
  )
}
