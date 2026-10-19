import { getLocale } from "@/lib/i18n"
import type { Period } from "@/types/ui"

const DAY_MS = 24 * 60 * 60 * 1000

/** Local calendar day as YYYY-MM-DD (the format the API uses for mood and habits). */
export function toDayKey(date: Date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

export function fromDayKey(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year, month - 1, date)
}

export function startOfDay(date: Date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  return start
}

export function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** Midnight of the Sunday that starts the week containing `date`. */
export function startOfWeek(date: Date = new Date()) {
  const start = startOfDay(date)
  start.setDate(start.getDate() - start.getDay())
  return start
}

export function isSameDay(a: Date, b: Date) {
  return toDayKey(a) === toDayKey(b)
}

export function minutesSinceMidnight(date: Date) {
  return date.getHours() * 60 + date.getMinutes()
}

/** The last `count` day keys, oldest first, ending today. */
export function lastDays(count: number, today: Date = new Date()) {
  return Array.from({ length: count }, (_, index) => toDayKey(addDays(today, index - count + 1)))
}

/** Every day key from `from` to `to`, or [] when the range is invalid, in the future or over a year long. */
export function dayRange(from: string, to: string): string[] {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && toDayKey(fromDayKey(value)) === value
  if (!valid(from) || !valid(to) || from > to || to > toDayKey()) return []
  const days: string[] = []
  let cursor = fromDayKey(from)
  while (toDayKey(cursor) <= to && days.length <= 366) {
    days.push(toDayKey(cursor))
    cursor = addDays(cursor, 1)
  }
  return days.length <= 366 ? days : []
}

/** The days a period filter covers: the last 7 or 30 days, or the custom range. */
export function periodDays(period: Period, from: string, to: string) {
  return period === "custom" ? dayRange(from, to) : lastDays(period === "week" ? 7 : 30)
}

export function formatDate(value: string | Date, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat(getLocale(), options).format(new Date(value))
}

export function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat(getLocale(), { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

/** "today", "tomorrow", "3 days ago"… relative to the current local day. */
export function formatRelativeDay(value: string | Date, now: Date = new Date()) {
  const days = Math.round((startOfDay(new Date(value)).getTime() - startOfDay(now).getTime()) / DAY_MS)
  return new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" }).format(days, "day")
}

/** ISO timestamp → value for an `<input type="date">`. */
export function toDateInput(value: string | null) {
  return value ? toDayKey(new Date(value)) : ""
}

/** `<input type="date">` value → ISO timestamp at local midnight, or null when empty. */
export function fromDateInput(value: string) {
  return value ? fromDayKey(value).toISOString() : null
}

/** ISO timestamp → value for an `<input type="datetime-local">`. */
export function toDateTimeInput(value: string | Date) {
  const date = new Date(value)
  return `${toDayKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

export function fromDateTimeInput(value: string) {
  return new Date(value).toISOString()
}
