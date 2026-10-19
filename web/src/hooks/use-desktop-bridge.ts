import { useEffect } from "react"
import { useRouter } from "@tanstack/react-router"
import { playChime } from "@/lib/chime"
import { onDesktopNavigate } from "@/lib/desktop-app"
import { onPomodoroCompleted } from "@/lib/desktop-pomodoro"

/** Reacts to the main process: tray/notification navigation and the pomodoro chime. */
export function useDesktopBridge() {
  const router = useRouter()

  useEffect(() => onDesktopNavigate((route) => router.history.push(route)), [router])

  useEffect(
    () =>
      onPomodoroCompleted(({ sound }) => {
        if (sound) playChime()
      }),
    [],
  )
}
