import React from 'react'
import CoachDashboard from './CoachDashboard.jsx'

/**
 * CoachView — Pit Wall Coach & Race Engineer Intelligence Console
 *
 * Provides real-time tactical overview for race engineers and coaches:
 * - PPO Energy deployment recommendations
 * - Dual-model XGBoost overtake confidence
 * - FIA Stewards Overtake Legality assessment ("clean" | "marginal" | "risky")
 * - 20Hz live telemetry sparklines
 * - Pit-to-driver voice radio with transmission verification
 * - FIA compliance guard audit trail
 */
export default function CoachView({
  decision,
  history = { speed: [], soc: [], gap: [], power: [], pace: [] },
  complianceLogs = [],
  onRadioBroadcast,
  driverAudioState,
}) {
  return (
    <div className="coach-view-container">
      <CoachDashboard
        decision={decision}
        history={history}
        complianceLogs={complianceLogs}
        onRadioBroadcast={onRadioBroadcast}
        driverAudioState={driverAudioState}
      />
    </div>
  )
}

export { CoachView }
