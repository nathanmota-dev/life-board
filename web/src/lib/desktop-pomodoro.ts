import type { PomodoroCommand, PomodoroCompletion, PomodoroSettings, PomodoroState } from "@/types/pomodoro"

// The pomodoro timer runs in Electron's main process; outside it (tests, plain browser) it is unavailable.

export function isPomodoroAvailable() {
  return Boolean(window.desktop?.pomodoro)
}

export function getPomodoroState() {
  return window.desktop?.pomodoro?.getState() ?? Promise.resolve(null)
}

export function dispatchPomodoro(command: PomodoroCommand) {
  return window.desktop?.pomodoro?.dispatch(command) ?? Promise.resolve(null)
}

export function updatePomodoroSettings(patch: Partial<PomodoroSettings>) {
  return window.desktop?.pomodoro?.updateSettings(patch) ?? Promise.resolve(null)
}

export function onPomodoroState(callback: (state: PomodoroState) => void) {
  return window.desktop?.pomodoro?.onState(callback) ?? (() => {})
}

export function onPomodoroCompleted(callback: (completion: PomodoroCompletion) => void) {
  return window.desktop?.pomodoro?.onCompleted(callback) ?? (() => {})
}
