/**
 * centralRaceState.js — Single Source of Truth for APEX PULSE Race Intelligence
 *
 * Guarantees 100% data consistency across all views:
 * - Active Driver & Competitor Grid (10 cars with synchronized gaps, tyres, positions)
 * - Uniform Lap (Lap 30 / 50)
 * - Stabilized Probability Smoother (EMA with <= 2%/tick slew-rate limiter)
 * - System Health Diagnostics (Telemetry, AI Engine, Driver Link, Coach Link, 20Hz Stream)
 * - Unified Alert Queue (CRITICAL, WARNING, INFO with ACK/DISMISS)
 * - Deterministic 9-Step Hackathon Demo Mode Runner
 */

// 1. OFFICIAL 10-CAR MONZA GRID STANDINGS
export const INITIAL_GRID = [
  { pos: 1, driver: 'VER', number: 1, fullName: 'Max Verstappen #1', team: 'Red Bull Racing', teamColor: '#00E5FF', gap: '+0.000s', interval: 'LEADER', tyre: 'MED', tyreAge: 14, tyreLife: 68, ersPct: 68, speed: 332.4, isYou: false, id: 'driver_1' },
  { pos: 2, driver: 'NOR', number: 4, fullName: 'Lando Norris #4', team: 'McLaren', teamColor: '#FF8700', gap: '+1.240s', interval: '+1.24s', tyre: 'MED', tyreAge: 14, tyreLife: 65, ersPct: 62, speed: 330.1, isYou: false, id: 'driver_nor' },
  { pos: 3, driver: 'PIA', number: 81, fullName: 'Oscar Piastri #81', team: 'McLaren', teamColor: '#FF8700', gap: '+3.420s', interval: '+2.18s', tyre: 'HARD', tyreAge: 8, tyreLife: 78, ersPct: 48, speed: 326.5, isYou: false, id: 'driver_pia' },
  { pos: 4, driver: 'LEC', number: 16, fullName: 'Charles Leclerc #16', team: 'Ferrari', teamColor: '#E10600', gap: '+4.240s', interval: '+0.82s', tyre: 'HARD', tyreAge: 8, tyreLife: 82, ersPct: 52, speed: 324.8, isYou: true, id: 'driver_2' },
  { pos: 5, driver: 'SAI', number: 55, fullName: 'Carlos Sainz #55', team: 'Ferrari', teamColor: '#E10600', gap: '+4.980s', interval: '+0.74s', tyre: 'MED', tyreAge: 16, tyreLife: 60, ersPct: 56, speed: 322.0, isYou: false, id: 'driver_sai' },
  { pos: 6, driver: 'RUS', number: 63, fullName: 'George Russell #63', team: 'Mercedes', teamColor: '#00D2BE', gap: '+5.380s', interval: '+1.14s', tyre: 'HARD', tyreAge: 9, tyreLife: 74, ersPct: 58, speed: 320.4, isYou: false, id: 'driver_rus' },
  { pos: 7, driver: 'ALO', number: 14, fullName: 'Fernando Alonso #14', team: 'Aston Martin', teamColor: '#006F62', gap: '+7.750s', interval: '+2.37s', tyre: 'MED', tyreAge: 15, tyreLife: 55, ersPct: 44, speed: 319.2, isYou: false, id: 'driver_alo' },
  { pos: 8, driver: 'HAM', number: 44, fullName: 'Lewis Hamilton #44', team: 'Mercedes', teamColor: '#00D2BE', gap: '+8.200s', interval: '+0.45s', tyre: 'SOFT', tyreAge: 22, tyreLife: 38, ersPct: 34, speed: 318.5, isYou: false, id: 'driver_3' },
  { pos: 9, driver: 'TSU', number: 22, fullName: 'Yuki Tsunoda #22', team: 'RB Honda RBPT', teamColor: '#6692FF', gap: '+8.520s', interval: '+0.32s', tyre: 'MED', tyreAge: 17, tyreLife: 52, ersPct: 40, speed: 317.8, isYou: false, id: 'driver_tsu' },
  { pos: 10, driver: 'STR', number: 18, fullName: 'Lance Stroll #18', team: 'Aston Martin', teamColor: '#006F62', gap: '+12.400s', interval: '+3.88s', tyre: 'HARD', tyreAge: 12, tyreLife: 66, ersPct: 42, speed: 316.0, isYou: false, id: 'driver_str' },
]

// 2. PRIMARY DRIVERS REGISTRY
export const INITIAL_DRIVERS = {
  driver_1: {
    id: 'driver_1',
    name: 'M. VERSTAPPEN',
    code: 'VER',
    number: 1,
    team: 'Red Bull Racing',
    teamColor: '#00E5FF',
    position: 'P1',
    posNum: 1,
    lap: 30,
    total_laps: 50,
    gap_ahead_s: 0.0,
    gap_ahead_str: 'LEADER',
    gap_behind_s: 1.24,
    gap_behind_str: '+1.24s',
    car_ahead: 'NONE',
    car_behind: 'NOR #4',
    tyre_compound: 'MEDIUM',
    tyre_age: 14,
    tyre_life_pct: 68.0,
    fuel_kg: 32.4,
    fuel_pct: 65,
    soc: 0.68,
    ers_pct: 68,
    speed_kph: 332.4,
    pace_delta: '+0.00s',
    drs_available: 0,
    status: 'GREEN',
    status_text: 'STABLE',
    rpm: 11400,
    gear: 8,
  },
  driver_2: {
    id: 'driver_2',
    name: 'C. LECLERC',
    code: 'LEC',
    number: 16,
    team: 'Scuderia Ferrari',
    teamColor: '#E10600',
    position: 'P4',
    posNum: 4,
    lap: 30,
    total_laps: 50,
    gap_ahead_s: 0.82,
    gap_ahead_str: '+0.82s',
    gap_behind_s: 1.14,
    gap_behind_str: '+1.14s',
    car_ahead: 'PIA #81',
    car_behind: 'RUS #63',
    tyre_compound: 'HARD',
    tyre_age: 8,
    tyre_life_pct: 82.0,
    fuel_kg: 31.8,
    fuel_pct: 64,
    soc: 0.52,
    ers_pct: 52,
    speed_kph: 324.8,
    pace_delta: '-0.21s',
    drs_available: 1,
    status: 'YELLOW',
    status_text: 'ATTACKING',
    rpm: 11250,
    gear: 8,
  },
  driver_3: {
    id: 'driver_3',
    name: 'L. HAMILTON',
    code: 'HAM',
    number: 44,
    team: 'Mercedes-AMG Petronas',
    teamColor: '#00D2BE',
    position: 'P8',
    posNum: 8,
    lap: 30,
    total_laps: 50,
    gap_ahead_s: 0.45,
    gap_ahead_str: '+0.45s',
    gap_behind_s: 0.32,
    gap_behind_str: '+0.32s',
    car_ahead: 'ALO #14',
    car_behind: 'TSU #22',
    tyre_compound: 'SOFT',
    tyre_age: 22,
    tyre_life_pct: 38.0,
    fuel_kg: 33.1,
    fuel_pct: 66,
    soc: 0.34,
    ers_pct: 34,
    speed_kph: 318.5,
    pace_delta: '-0.12s',
    drs_available: 1,
    status: 'RED',
    status_text: 'CRITICAL',
    rpm: 10900,
    gear: 7,
  },
}

// 3. PROBABILITY SMOOTHER (Exponential Moving Average + Slew-Rate Limiter)
class ProbabilityStabilizer {
  constructor() {
    this.smoothed = 78.0
    this.alpha = 0.20 // Filter weight
    this.maxSlew = 2.0 // Max percentage points change per tick
  }

  update(rawTarget) {
    const target = Math.max(5, Math.min(98, Number(rawTarget) || 78))
    // Step 1: Exponential smoothing
    const ema = this.smoothed + this.alpha * (target - this.smoothed)
    // Step 2: Slew-rate clamping (avoid rapid jumps e.g. 60% -> 90%)
    const delta = Math.max(-this.maxSlew, Math.min(this.maxSlew, ema - this.smoothed))
    this.smoothed = Math.round((this.smoothed + delta) * 10) / 10
    return Math.round(this.smoothed)
  }

  get() {
    return Math.round(this.smoothed)
  }

  set(val) {
    this.smoothed = Math.max(5, Math.min(98, Number(val)))
  }
}

export const probStabilizer = new ProbabilityStabilizer()

// 4. DETERMINISTIC 9-STEP HACKATHON DEMO SEQUENCE
export const DEMO_STEPS = [
  {
    step: 1,
    title: '1. Detect Opportunity',
    desc: 'Monza Rettifilo straight approach: LEC #16 gap to PIA #81 narrows to 0.82s inside DRS zone.',
    prob: 78,
    action: 'MONITORING',
    radioMsg: 'DRS detection zone 1 confirmed. Gap 0.82s.',
    commsStage: 'READY',
    carAhead: 'PIA #81',
    pos: 4,
    delta: '-0.18s',
  },
  {
    step: 2,
    title: '2. AI Prob Rises to 84%',
    desc: 'XGBoost & DualModelCore inference converges: 84% probability under smooth low-pass filter.',
    prob: 84,
    action: 'OVERTAKE WINDOW OPEN',
    radioMsg: 'AI model confirms high pass probability at 84%. Favourable tow.',
    commsStage: 'READY',
    carAhead: 'PIA #81',
    pos: 4,
    delta: '-0.24s',
  },
  {
    step: 3,
    title: '3. AI Engine Recommends Attack',
    desc: 'Expected Value evaluates positive (+0.98s net). Mode 4 Boost armed with 92% confidence.',
    prob: 84,
    action: 'ATTACK NOW (MODE 4)',
    radioMsg: 'Pit Wall Strategy Directive: Attack PIA into Turn 1 braking zone.',
    commsStage: 'SENDING',
    carAhead: 'PIA #81',
    pos: 4,
    delta: '-0.28s',
  },
  {
    step: 4,
    title: '4. Coach Sends Attack Directive',
    desc: 'Pit Wall Coach transmits high-priority radio order to Charles Leclerc.',
    prob: 84,
    action: 'ATTACK NOW (MODE 4)',
    radioMsg: 'Attack PIA +16 on brakes into Turn 1, Mode 4 Boost!',
    commsStage: 'SENT',
    carAhead: 'PIA #81',
    pos: 4,
    delta: '-0.32s',
  },
  {
    step: 5,
    title: '5. Driver Display Receives Order',
    desc: 'Driver DDU steering screen flashes "MODE 4 OVERTAKE ARMED · BRAKE AT 85m".',
    prob: 85,
    action: 'ATTACK NOW (MODE 4)',
    radioMsg: 'Attack PIA +16 on brakes into Turn 1, Mode 4 Boost!',
    commsStage: 'DELIVERED',
    carAhead: 'PIA #81',
    pos: 4,
    delta: '-0.35s',
  },
  {
    step: 6,
    title: '6. Driver Acknowledges ("ACK")',
    desc: 'Driver voice & CAN button confirm receipt: "COPY, DEPLOYING BOOST INTO TURN 1".',
    prob: 86,
    action: 'ATTACK NOW (MODE 4)',
    radioMsg: 'COPY, DEPLOYING MGU-K BOOST · ATTACKING INTO TURN 1',
    commsStage: 'ACKNOWLEDGED',
    carAhead: 'PIA #81',
    pos: 4,
    delta: '-0.40s',
  },
  {
    step: 7,
    title: '7. Overtake Maneuver Executes',
    desc: 'Late-braking dive down the inside into Variante del Rettifilo. Closing delta +12.4 km/h.',
    prob: 92,
    action: 'PASS IN PROGRESS',
    radioMsg: 'Alongside at apex! Full track room maintained.',
    commsStage: 'ACTION EXECUTED',
    carAhead: 'PIA #81',
    pos: 4,
    delta: '-0.48s',
  },
  {
    step: 8,
    title: '8. Position Delta Updates (P4 -> P3)',
    desc: 'Pass completed cleanly! Standings update across all screens: LEC advances to P3!',
    prob: 96,
    action: 'OVERTAKE COMPLETED',
    radioMsg: 'Position gained! P3 secured, gap to NOR +2.18s.',
    commsStage: 'ACTION EXECUTED',
    carAhead: 'NOR #4',
    pos: 3,
    delta: '+0.00s',
  },
  {
    step: 9,
    title: '9. Race Timeline Logs Event',
    desc: 'Official event logged into race telemetry record with full telemetry audit trail.',
    prob: 72,
    action: 'MANAGE DELTA',
    radioMsg: 'Recharge SOC in Curva Grande. Manage tyres.',
    commsStage: 'ACTION EXECUTED',
    carAhead: 'NOR #4',
    pos: 3,
    delta: '-0.15s',
  },
]

// 5. CENTRAL RACE STATE MANAGER (Singleton)
class CentralRaceStateManager {
  constructor() {
    this.activeDriverId = 'driver_2' // Default to Charles Leclerc #16
    this.lap = 30
    this.totalLaps = 50
    this.grid = [...INITIAL_GRID]
    this.drivers = { ...INITIAL_DRIVERS }
    this.systemHealth = {
      telemetry: 'CONNECTED',
      telemetryPingMs: 14,
      aiEngine: 'ONLINE (20Hz)',
      driverLink: 'LIVE',
      coachLink: 'LIVE',
      streamHealth: 'HEALTHY',
    }
    this.alerts = [
      {
        id: 'alt-01',
        severity: 'INFO',
        source: 'DRS SYSTEM',
        time: '15:24:10',
        message: 'DRS Wing Flap armed. Rear wing stall zone active on Rettifilo straight.',
        acknowledged: false,
      },
      {
        id: 'alt-02',
        severity: 'WARNING',
        source: 'TYRE THERMALS',
        time: '15:23:45',
        message: 'Right-rear carcass temp peak 104°C. Manage scrubbing through Ascari.',
        acknowledged: false,
      },
      {
        id: 'alt-03',
        severity: 'INFO',
        source: 'PIT WALL AI',
        time: '15:22:30',
        message: 'Pit window open Laps 34–36. Medium to Hard tyre change recommended (+1.8s gain).',
        acknowledged: true,
      },
    ]
    this.demoModeActive = false
    this.demoStepIndex = 0
    this.listeners = new Set()
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  notify() {
    const snapshot = this.getSnapshot()
    this.listeners.forEach((fn) => {
      try { fn(snapshot) } catch (e) { console.error('centralRaceState listener err:', e) }
    })
  }

  setActiveDriver(driverId) {
    if (this.drivers[driverId]) {
      this.activeDriverId = driverId
      // Update "isYou" flag in grid
      this.grid = this.grid.map((c) => ({
        ...c,
        isYou: c.id === driverId,
      }))
      this.notify()
    }
  }

  getActiveDriver() {
    return this.drivers[this.activeDriverId] || this.drivers['driver_2']
  }

  getSnapshot() {
    return {
      activeDriverId: this.activeDriverId,
      activeDriver: this.getActiveDriver(),
      grid: this.grid,
      drivers: this.drivers,
      lap: this.lap,
      totalLaps: this.totalLaps,
      systemHealth: this.systemHealth,
      alerts: this.alerts,
      demoModeActive: this.demoModeActive,
      demoStepIndex: this.demoStepIndex,
      currentDemoStep: DEMO_STEPS[this.demoStepIndex],
    }
  }

  // ALERTS MANAGEMENT
  acknowledgeAlert(alertId) {
    this.alerts = this.alerts.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a))
    this.notify()
  }

  dismissAlert(alertId) {
    this.alerts = this.alerts.filter((a) => a.id !== alertId)
    this.notify()
  }

  addAlert(severity, source, message) {
    const now = new Date()
    const time = now.toTimeString().split(' ')[0]
    const newAlert = {
      id: `alt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      severity,
      source,
      time,
      message,
      acknowledged: false,
    }
    this.alerts = [newAlert, ...this.alerts.slice(0, 7)]
    this.notify()
  }

  // DEMO MODE ACTIONS
  toggleDemoMode(active) {
    this.demoModeActive = active !== undefined ? active : !this.demoModeActive
    if (!this.demoModeActive) {
      // Reset grid and driver
      this.grid = [...INITIAL_GRID]
      this.drivers = { ...INITIAL_DRIVERS }
      this.demoStepIndex = 0
    }
    this.notify()
  }

  setDemoStep(stepIdx) {
    if (stepIdx < 0 || stepIdx >= DEMO_STEPS.length) return
    this.demoStepIndex = stepIdx
    const step = DEMO_STEPS[stepIdx]

    // If step >= 7 (pass completed), update grid standings
    if (stepIdx >= 7) {
      // Charles Leclerc moves to P3, Oscar Piastri drops to P4
      this.grid = [
        { ...this.grid[0] }, // P1 VER
        { ...this.grid[1] }, // P2 NOR
        {
          pos: 3,
          driver: 'LEC',
          number: 16,
          fullName: 'Charles Leclerc #16',
          team: 'Ferrari',
          teamColor: '#E10600',
          gap: '+3.420s',
          interval: '+2.18s',
          tyre: 'HARD',
          tyreAge: 8,
          tyreLife: 80,
          ersPct: 42,
          speed: 326.5,
          isYou: this.activeDriverId === 'driver_2',
          id: 'driver_2',
        },
        {
          pos: 4,
          driver: 'PIA',
          number: 81,
          fullName: 'Oscar Piastri #81',
          team: 'McLaren',
          teamColor: '#FF8700',
          gap: '+4.240s',
          interval: '+0.82s',
          tyre: 'HARD',
          tyreAge: 8,
          tyreLife: 76,
          ersPct: 46,
          speed: 322.8,
          isYou: false,
          id: 'driver_pia',
        },
        ...this.grid.slice(4),
      ]
      this.drivers.driver_2.position = 'P3'
      this.drivers.driver_2.posNum = 3
      this.drivers.driver_2.car_ahead = 'NOR #4'
      this.drivers.driver_2.car_behind = 'PIA #81'
      this.drivers.driver_2.gap_ahead_s = 2.18
      this.drivers.driver_2.gap_ahead_str = '+2.18s'
      this.drivers.driver_2.gap_behind_s = 0.82
      this.drivers.driver_2.gap_behind_str = '+0.82s'
    } else {
      this.grid = [...INITIAL_GRID]
      this.drivers.driver_2.position = 'P4'
      this.drivers.driver_2.posNum = 4
      this.drivers.driver_2.car_ahead = 'PIA #81'
      this.drivers.driver_2.car_behind = 'RUS #63'
      this.drivers.driver_2.gap_ahead_s = 0.82
      this.drivers.driver_2.gap_ahead_str = '+0.82s'
      this.drivers.driver_2.gap_behind_s = 1.14
      this.drivers.driver_2.gap_behind_str = '+1.14s'
    }

    probStabilizer.set(step.prob)
    this.notify()
  }

  nextDemoStep() {
    if (this.demoStepIndex < DEMO_STEPS.length - 1) {
      this.setDemoStep(this.demoStepIndex + 1)
    }
  }

  prevDemoStep() {
    if (this.demoStepIndex > 0) {
      this.setDemoStep(this.demoStepIndex - 1)
    }
  }
}

export const centralRaceState = new CentralRaceStateManager()
