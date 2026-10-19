import { useEffect, useState } from "react"

/** The current time, refreshed on an interval and window focus (paused when null). */
export function useNow(intervalMs: number | null = 30_000) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (intervalMs === null) return
    const tick = () => setNow(new Date())
    tick()
    const timer = window.setInterval(tick, intervalMs)
    window.addEventListener("focus", tick)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", tick)
    }
  }, [intervalMs])

  return now
}
