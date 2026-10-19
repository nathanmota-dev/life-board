import { useEffect, useState } from "react"

/** The current time in ms, refreshed every `intervalMs` (paused when null). */
export function useNow(intervalMs: number | null = 1000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (intervalMs === null) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])

  return now
}
