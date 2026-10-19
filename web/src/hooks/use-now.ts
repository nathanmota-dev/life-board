import { useEffect, useState } from "react"

/** The current time, refreshed every `intervalMs` and when the window regains focus. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const timer = window.setInterval(tick, intervalMs)
    window.addEventListener("focus", tick)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", tick)
    }
  }, [intervalMs])
  return now
}
