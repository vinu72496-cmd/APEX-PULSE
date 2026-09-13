import React, { useEffect } from 'react'

/**
 * DASHBOARD_SECTIONS — The canonical list of existing dashboard sections in Apex Pulse
 */
export const DASHBOARD_SECTIONS = [
  {
    id: 'overview',
    label: 'OVERVIEW',
    fullName: 'Race Command Center',
    tag: '3-COLUMN INTEL',
    icon: '🏁',
    desc: 'Grid Standings, Track & Strategy',
    shortcut: '1'
  },
  {
    id: 'driver',
    label: 'DRIVER DDU',
    fullName: 'Driver Display Unit',
    tag: 'MOTEC COCKPIT',
    icon: '🏎️',
    desc: 'Cockpit POV, Shift LEDs, Steer & Pedals',
    shortcut: '2'
  },
  {
    id: 'coach',
    label: 'PIT WALL COACH',
    fullName: 'Pit Wall Coach Console',
    tag: 'TEAM RADIO & COMMS',
    icon: '📡',
    desc: 'Voice Radio, Direct Call, FIA Compliance',
    shortcut: '3'
  },
  {
    id: 'strategy',
    label: 'AI STRATEGY',
    fullName: 'AI Strategy Engine',
    tag: 'OVERTAKE DEEP DIVE',
    icon: '🧠',
    desc: 'Overtake Probability, DRS & Undercut',
    shortcut: '4'
  },
  {
    id: 'telemetry',
    label: 'LIVE TELEMETRY',
    fullName: 'Live Telemetry & Track',
    tag: '20Hz CAN-BUS',
    icon: '📊',
    desc: 'Interactive Traces, Gaps & Speed Curves',
    shortcut: '5'
  },
  {
    id: 'laps',
    label: 'LAPS & DATA',
    fullName: 'Historical Monza Laps',
    tag: '50-LAP KAGGLE LOGS',
    icon: '⏱️',
    desc: 'Sector Timings, Pit Deltas & Event Feed',
    shortcut: '6'
  },
  {
    id: 'all',
    label: 'ALL SECTIONS',
    fullName: 'All Dashboards Stacked',
    tag: 'SEQUENTIAL VIEW',
    icon: '📑',
    desc: 'Complete Multi-Dashboard Overview',
    shortcut: '7'
  }
]

/**
 * TopNavigationBar — Persistent horizontal navigation bar located directly below the header.
 */
export default function TopNavigationBar({
  currentSection = 'overview',
  onSelectSection = () => {},
  onOpenGuide = () => {},
  onOpenDebug = () => {}
}) {
  // Normalize alias IDs ('live' -> 'overview', 'command' -> 'overview', 'track' -> 'telemetry')
  const normalizedActiveId = (() => {
    if (['live', 'command', 'overview'].includes(currentSection)) return 'overview'
    if (['track', 'telemetry'].includes(currentSection)) return 'telemetry'
    return currentSection
  })()

  const currentMeta = DASHBOARD_SECTIONS.find((s) => s.id === normalizedActiveId) || DASHBOARD_SECTIONS[0]

  // Keyboard shortcut listener (keys 1-7 for fast race-engineer switching)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
      const matched = DASHBOARD_SECTIONS.find((s) => s.shortcut === e.key)
      if (matched) {
        onSelectSection(matched.id)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSelectSection])

  return (
    <nav className="f1-persistent-navbar" aria-label="Dashboard Primary Navigation">
      {/* 1. Left: Horizontal Section Tabs */}
      <div className="f1-nav-scroll-container">
        <div className="f1-nav-tabs-track" role="tablist">
          {DASHBOARD_SECTIONS.map((sec) => {
            const isActive = sec.id === normalizedActiveId
            return (
              <button
                key={sec.id}
                role="tab"
                aria-selected={isActive}
                className={`f1-nav-tab-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectSection(sec.id)}
                title={`${sec.fullName} (${sec.desc}) — Press [${sec.shortcut}]`}
              >
                {/* Active Indicator Pip */}
                <span className={`nav-tab-pip ${isActive ? 'active' : ''}`} />

                {/* Section Icon */}
                <span className="nav-tab-icon">{sec.icon}</span>

                {/* Section Label */}
                <div className="nav-tab-content">
                  <span className="nav-tab-title">{sec.label}</span>
                  <span className="nav-tab-tag">{sec.tag}</span>
                </div>

                {/* Key Shortcut Pill */}
                <span className="nav-tab-key" title={`Keyboard shortcut: ${sec.shortcut}`}>
                  {sec.shortcut}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 2. Right: WHERE AM I? Location Indicator & Utility Controls */}
      <div className="f1-nav-meta-actions">
        <div className="nav-location-breadcrumb" title={`Currently viewing: ${currentMeta.fullName}`}>
          <span className="loc-label">ACTIVE:</span>
          <span className="loc-title">
            <span className="loc-icon">{currentMeta.icon}</span>
            <span className="loc-name">{currentMeta.fullName}</span>
          </span>
          <span className="loc-badge">{currentMeta.tag}</span>
        </div>

        <div className="nav-utility-group">
          <button
            className="nav-utility-btn guide-btn"
            onClick={onOpenGuide}
            title="Open System Architecture & Judging Guide Modal"
          >
            <span className="btn-icon">📖</span>
            <span className="btn-txt">GUIDE</span>
          </button>
          <button
            className="nav-utility-btn debug-btn"
            onClick={onOpenDebug}
            title="Open Live AI Calculation Pipeline Inspector"
          >
            <span className="btn-icon">⚡</span>
            <span className="btn-txt">INSPECT AI</span>
          </button>
        </div>
      </div>
    </nav>
  )
}