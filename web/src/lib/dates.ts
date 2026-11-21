import { getLocale, i18n } from "@/lib/i18n"
import type { DateFormat } from "@/types/i18n"
import type { Period } from "@/types/ui"

export const DATE_FORMAT_STORAGE_KEY = "life-board-date-format"

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

/** The chosen date format, or the language's own order when none was chosen. */
export function getDateFormat(): DateFormat {
  try {
    const stored = localStorage.getItem(DATE_FORMAT_STORAGE_KEY)
    if (stored === "dmy" || stored === "mdy") return stored
  } catch { /* storage unavailable: fall back to the language */ }
  return getLocale() === "pt-BR" ? "dmy" : "mdy"
}

export function setDateFormat(format: DateFormat) {
  try { localStorage.setItem(DATE_FORMAT_STORAGE_KEY, format) } catch { /* keeps the language default */ }
  // Every translated component re-renders on languageChanged, so dates update app-wide.
  void i18n.changeLanguage(i18n.resolvedLanguage)
}

/** English follows the format with en-GB/en-US; Portuguese has no month-first locale. */
export function getDateLocale() {
  if (getLocale() === "pt-BR") return "pt-BR"
  return getDateFormat() === "dmy" ? "en-GB" : "en-US"
}

/** Formats dates for display everywhere in the app, in the language and date format from Settings. */
export function formatDate(value: string | Date | number, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  const date = new Date(value)
  const formatter = new Intl.DateTimeFormat(getDateLocale(), options)
  if (getLocale() !== "pt-BR" || getDateFormat() === "dmy") return formatter.format(date)
  // Portuguese with month first: swap the numeric day and month, keeping month names as they are.
  const parts = formatter.formatToParts(date)
  const day = parts.find((part) => part.type === "day")
  const month = parts.find((part) => part.type === "month")
  if (day && month && /^\d+$/.test(month.value)) [day.value, month.value] = [month.value, day.value]
  return parts.map((part) => part.value).join("")
}

/** Date and time with numeric day, month and year, like 21/11/2026, 05:42. */
export function formatDateTime(value: string | Date | number) {
  return formatDate(value, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat(getDateLocale(), { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
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

/** 1 for January 1st. */
export function dayOfYear(date: Date = new Date()) {
  return Math.round((startOfDay(date).getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / DAY_MS) + 1
}

/** ISO 8601 week number (weeks start on Monday; week 1 holds the first Thursday). */
export function isoWeek(date: Date = new Date()) {
  const thursday = startOfDay(date)
  thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7))
  return Math.ceil(dayOfYear(thursday) / 7)
}
