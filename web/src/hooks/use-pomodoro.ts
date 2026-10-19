import { useEffect, useState } from "react"
import { useNow } from "@/hooks/use-now"
import { dispatchPomodoro, getPomodoroState, onPomodoroState, updatePomodoroSettings } from "@/lib/desktop-pomodoro"
import { phaseProgress, remainingMs } from "@/lib/pomodoro"
import type { PomodoroController, PomodoroState } from "@/types/pomodoro"

/** Follows the main-process timer; null until its state arrives (or outside Electron). */
export function usePomodoro(): PomodoroController | null {
  const [state, setState] = useState<PomodoroState | null>(null)
  const now = useNow(state?.status === "running" ? 250 : null)

  useEffect(() => {
    let active = true
    void getPomodoroState().then((next) => {
      if (active && next) setState(next)
    })
    const unsubscribe = onPomodoroState(setState)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  if (!state) return null
  const remaining = remainingMs(state, now.getTime())
  const apply = (next: PomodoroState | null) => {
    if (next) setState(next)
  }

  return {
    state,
    remainingMs: remaining,
    progress: phaseProgress(state, remaining),
    dispatch: (command) => void dispatchPomodoro(command).then(apply),
    updateSettings: (patch) => void updatePomodoroSettings(patch).then(apply),
  }
}
