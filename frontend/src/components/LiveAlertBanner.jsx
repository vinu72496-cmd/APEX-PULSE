import React, { useState, useEffect } from 'react'
import { centralRaceState } from '../utils/centralRaceState.js'

/**
 * LiveAlertBanner — Unified Critical Alert Center
 *
 * Implements Criterion 9:
 * 1. Unified alert queue (CRITICAL, WARNING, INFO)
 * 2. Exact timestamps (HH:MM:SS)
 * 3. Subsystem sources (DRS, TYRE THERMALS, PIT WALL AI, ERS, ENGINE)
 * 4. Distinct [ ACK ] and [ DISMISS ] action buttons
 * 5. Professional motorsport telemetry aesthetic without excessive flashing
 */
export default function LiveAlertBanner({ decision }) {
  const [alerts, setAlerts] = useState(() => centralRaceState.getSnapshot().alerts)

  useEffect(() => {
    const unsub = centralRaceState.subscribe((snap) => {
      setAlerts(snap.alerts)
    })
    return () => unsub()
  }, [])

  const handleAcknowledge = (id, e) => {
    e.stopPropagation()
    centralRaceState.acknowledgeAlert(id)
  }

  const handleDismiss = (id, e) => {
    e.stopPropagation()
    centralRaceState.dismissAlert(id)
  }

  if (!alerts || alerts.length === 0) {
    return (
      <div className="live-alert-ticker empty">
        <div className="alert-ticker-tag">
          <span className="ticker-pulse-pip green" />
          <span>ALERT SYSTEM: ALL SUBSYSTEMS NOMINAL · NO UNRESOLVED WARNINGS</span>
        </div>
      </div>
    )
  }

  return (
    <div className="live-alert-ticker unified-alert-center">
      <div className="alert-ticker-tag">
        <span className="ticker-pulse-pip" />
        <span className="ticker-label">ACTIVE ALERTS ({alerts.length})</span>
      </div>

      <div className="alert-items-track">
        {alerts.map((a) => {
          const sev = (a.severity || 'INFO').toLowerCase()
          return (
            <div
              key={a.id}
              className={`alert-chip unified-chip alert-${sev} ${a.acknowledged ? 'is-acked' : ''}`}
            >
              <span className={`alert-sev-badge ${sev}`}>
                {a.severity}
              </span>
              <span className="alert-time-stamp">[{a.time}]</span>
              <span className="alert-source-tag">{a.source}:</span>
              <span className="alert-chip-message">{a.message}</span>

              {/* Action Buttons */}
              <div className="alert-action-group">
                {!a.acknowledged ? (
                  <button
                    className="alert-btn ack"
                    onClick={(e) => handleAcknowledge(a.id, e)}
                    title="Acknowledge alert and log to telemetry audit"
                  >
                    ACK
                  </button>
                ) : (
                  <span className="alert-acked-label">✓ ACKED</span>
                )}
                <button
                  className="alert-btn dismiss"
                  onClick={(e) => handleDismiss(a.id, e)}
                  title="Dismiss alert from active queue"
                >
                  ✕
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
