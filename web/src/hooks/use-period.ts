import { useState } from "react"
import { lastDays, periodDays, toDayKey } from "@/lib/dates"
import type { Period, PeriodState } from "@/types/ui"

/** State for the shared period filter, starting on the last 7 days with a 30-day custom range. */
export function usePeriod(initial: Period = "week"): PeriodState {
  const [period, setPeriod] = useState<Period>(initial)
  const [from, setFrom] = useState(lastDays(30)[0])
  const [to, setTo] = useState(toDayKey())
  return { period, setPeriod, from, setFrom, to, setTo, days: periodDays(period, from, to) }
}
