import type { ReactNode } from "react"

// Mirrors desktop/src/pomodoro-timer.ts; the main process owns the timer and broadcasts this state.

export type PomodoroPhase = "focus" | "shortBreak" | "longBreak"
export type PomodoroStatus = "idle" | "running" | "paused"

export type PomodoroSettings = {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
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
  remainingMs: number
  endsAt: number | null
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

export type PomodoroCompletion = { phase: PomodoroPhase; next: PomodoroPhase; sound: boolean }

export type PomodoroPreset = {
  id: "classic" | "long" | "deep"
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
}

export type NumericPomodoroSetting = "focusMinutes" | "shortBreakMinutes" | "longBreakMinutes" | "longBreakEvery" | "dailyGoal"
export type PomodoroFlag = "breaksEnabled" | "autoStart" | "sound"

export type DurationSetting = {
  key: NumericPomodoroSetting
  labelKey: "focusLength" | "shortBreakLength" | "longBreakLength" | "longBreakEvery" | "dailyGoal"
  step: number
  unit: "minutesUnit" | "sessionsUnit"
}

export type FlagSetting = { key: PomodoroFlag; hintKey: "breaksHint" | "autoStartHint" | "soundHint" }

export type PomodoroController = {
  state: PomodoroState
  remainingMs: number
  progress: number
  dispatch: (command: PomodoroCommand) => void
  updateSettings: (patch: Partial<PomodoroSettings>) => void
}

export type PomodoroTimerProps = { pomodoro: PomodoroController }

export type TimerRingProps = { progress: number; tone: "focus" | "break"; children: ReactNode }

export type TimerControlsProps = { pomodoro: PomodoroController }

export type CycleDotsProps = { filled: number; total: number }

export type PomodoroSettingsPanelProps = { pomodoro: PomodoroController }

export type DurationStepperProps = {
  id: string
  label: string
  unit: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}

export type SettingSwitchProps = {
  id: string
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export type FocusStatsWidgetProps = { state: PomodoroState }

export type MacWindowProps = {
  title: string
  className?: string
  bodyClassName?: string
  children: ReactNode
}

export type StatusBarProps = {
  now: Date
  location?: import("@/types/weather").GeoLocation
  weather?: import("@/types/weather").Weather
  pomodoro: PomodoroController | null
}
