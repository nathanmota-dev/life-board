// The pomodoro state machine. Pure functions over plain data, so the main process
// stays the single source of truth and windows only render what it broadcasts.

export type PomodoroPhase = "focus" | "shortBreak" | "longBreak"
export type PomodoroStatus = "idle" | "running" | "paused"

export type PomodoroSettings = {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  /** A long break replaces the short one after this many focus sessions. */
  longBreakEvery: number
  dailyGoal: number
  breaksEnabled: boolean
  autoStart: boolean
  sound: boolean
}

export type PomodoroToday = { day: string; sessions: number; focusMinutes: number }

export type PomodoroState = {
  phase: PomodoroPhase
  status: PomodoroStatus
  durationMs: number
  /** Time left while idle or paused; while running it is derived from `endsAt`. */
  remainingMs: number
  endsAt: number | null
  /** Focus sessions finished in the current set (resets after a long break). */
  cycle: number
  settings: PomodoroSettings
  today: PomodoroToday
}

export type PomodoroCommand =
  | { type: "start" }
  | { type: "pause" }
  | { type: "toggle" }
  | { type: "reset" }
  | { type: "skip" }
  | { type: "select-phase"; phase: PomodoroPhase }

const MINUTE_MS = 60_000

const PHASES: PomodoroPhase[] = ["focus", "shortBreak", "longBreak"]
const COMMANDS: PomodoroCommand["type"][] = ["start", "pause", "toggle", "reset", "skip", "select-phase"]

export const DEFAULT_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  dailyGoal: 8,
  breaksEnabled: false,
  autoStart: false,
  sound: true,
}

const LIMITS = {
  focusMinutes: [1, 180],
  shortBreakMinutes: [1, 60],
  longBreakMinutes: [1, 90],
  longBreakEvery: [2, 8],
  dailyGoal: [1, 24],
} as const

const FLAGS = ["breaksEnabled", "autoStart", "sound"] as const

/** Merges untrusted input (IPC, the saved file) over `base`, clamping numbers to sane ranges. */
export function sanitizeSettings(input: unknown, base: PomodoroSettings = DEFAULT_SETTINGS): PomodoroSettings {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const next = { ...base }
  for (const [key, [min, max]] of Object.entries(LIMITS) as [keyof typeof LIMITS, readonly [number, number]][]) {
    const value = source[key]
    if (typeof value === "number" && Number.isFinite(value)) next[key] = Math.min(max, Math.max(min, Math.round(value)))
  }
  for (const key of FLAGS) {
    if (typeof source[key] === "boolean") next[key] = source[key]
  }
  return next
}

export function isPomodoroCommand(value: unknown): value is PomodoroCommand {
  const command = value as PomodoroCommand | null
  if (!command || typeof command !== "object" || !COMMANDS.includes(command.type)) return false
  return command.type !== "select-phase" || PHASES.includes(command.phase)
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(time: number) {
  const date = new Date(time)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

export function emptyDay(time: number): PomodoroToday {
  return { day: dayKey(time), sessions: 0, focusMinutes: 0 }
}

export function phaseMinutes(phase: PomodoroPhase, settings: PomodoroSettings) {
  if (phase === "focus") return settings.focusMinutes
  return phase === "shortBreak" ? settings.shortBreakMinutes : settings.longBreakMinutes
}

function idleAt(state: PomodoroState, phase: PomodoroPhase): PomodoroState {
  const durationMs = phaseMinutes(phase, state.settings) * MINUTE_MS
  return { ...state, phase, status: "idle", durationMs, remainingMs: durationMs, endsAt: null }
}

export function createState(settings: PomodoroSettings, today: PomodoroToday, cycle = 0): PomodoroState {
  const base: PomodoroState = { phase: "focus", status: "idle", durationMs: 0, remainingMs: 0, endsAt: null, cycle, settings, today }
  return idleAt(base, "focus")
}

export function remainingAt(state: PomodoroState, now: number) {
  return state.status === "running" && state.endsAt !== null ? Math.max(0, state.endsAt - now) : state.remainingMs
}

/** Starts a fresh day's stats once the date changes. */
export function rollDay(state: PomodoroState, now: number): PomodoroState {
  return state.today.day === dayKey(now) ? state : { ...state, today: emptyDay(now) }
}

/**
 * Ends the current phase and moves to the next one. `counted` is true when the
 * timer ran out (credits today's stats and honours auto-start), false on a skip.
 */
export function advance(state: PomodoroState, now: number, counted: boolean): PomodoroState {
  const { settings } = state
  let { cycle, today } = rollDay(state, now)
  let phase: PomodoroPhase = "focus"

  if (state.phase === "focus") {
    cycle += 1
    if (counted) {
      today = { ...today, sessions: today.sessions + 1, focusMinutes: today.focusMinutes + Math.round(state.durationMs / MINUTE_MS) }
    }
    if (settings.breaksEnabled) phase = cycle % settings.longBreakEvery === 0 ? "longBreak" : "shortBreak"
  } else if (state.phase === "longBreak") {
    cycle = 0
  }

  const next = idleAt({ ...state, cycle, today }, phase)
  return counted && settings.autoStart ? applyCommand(next, { type: "start" }, now) : next
}

export function applyCommand(state: PomodoroState, command: PomodoroCommand, now: number): PomodoroState {
  switch (command.type) {
    case "start":
      return state.status === "running" ? state : { ...state, status: "running", endsAt: now + state.remainingMs }
    case "pause":
      return state.status === "running" ? { ...state, status: "paused", remainingMs: remainingAt(state, now), endsAt: null } : state
    case "toggle":
      return applyCommand(state, { type: state.status === "running" ? "pause" : "start" }, now)
    case "reset":
      return idleAt(state, state.phase)
    case "skip":
      return advance(state, now, false)
    case "select-phase":
      return idleAt(state, command.phase)
  }
}

/** New durations apply right away to an idle timer, and from the next phase otherwise. */
export function updateSettings(state: PomodoroState, patch: unknown): PomodoroState {
  const settings = sanitizeSettings(patch, state.settings)
  const next = { ...state, settings }
  if (state.status !== "idle") return next
  return idleAt(next, settings.breaksEnabled ? state.phase : "focus")
}
