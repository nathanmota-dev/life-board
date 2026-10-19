import type { NumericPomodoroSetting, PomodoroPhase, PomodoroPreset, PomodoroSettings, PomodoroState } from "@/types/pomodoro"

export const POMODORO_PHASES: PomodoroPhase[] = ["focus", "shortBreak", "longBreak"]

export const POMODORO_PRESETS: PomodoroPreset[] = [
  { id: "classic", focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15 },
  { id: "long", focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 30 },
  { id: "deep", focusMinutes: 90, shortBreakMinutes: 20, longBreakMinutes: 30 },
]

/** Same ranges the main process clamps to (desktop/src/pomodoro-timer.ts). */
export const SETTING_LIMITS: Record<NumericPomodoroSetting, [number, number]> = {
  focusMinutes: [1, 180],
  shortBreakMinutes: [1, 60],
  longBreakMinutes: [1, 90],
  longBreakEvery: [2, 8],
  dailyGoal: [1, 24],
}

export function isBreak(phase: PomodoroPhase) {
  return phase !== "focus"
}

export function remainingMs(state: PomodoroState, now: number) {
  return state.status === "running" && state.endsAt !== null ? Math.max(0, state.endsAt - now) : state.remainingMs
}

export function phaseProgress(state: PomodoroState, remaining: number) {
  return state.durationMs > 0 ? Math.min(1, Math.max(0, 1 - remaining / state.durationMs)) : 0
}

/** "25:00", or "1:30:00" past an hour; rounds up so the last second reads 00:01. */
export function formatCountdown(ms: number) {
  const total = Math.ceil(Math.max(0, ms) / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0")
  const seconds = String(total % 60).padStart(2, "0")
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`
}

/**
 * Where the timer is in its set of focus sessions: how many are done (`filled`)
 * and which one is current. During a break the set stays lit up to the session just finished.
 */
export function cyclePosition({ phase, cycle, settings }: PomodoroState) {
  const total = settings.longBreakEvery
  const filled = phase === "focus" ? cycle % total : cycle === 0 ? 0 : ((cycle - 1) % total) + 1
  return { filled, current: phase === "focus" ? filled + 1 : filled, total }
}

export function sessionsUntilLongBreak(cycle: number, every: number) {
  return every - (cycle % every)
}

export function matchesPreset(settings: PomodoroSettings, preset: PomodoroPreset) {
  return (
    settings.focusMinutes === preset.focusMinutes &&
    settings.shortBreakMinutes === preset.shortBreakMinutes &&
    settings.longBreakMinutes === preset.longBreakMinutes
  )
}
