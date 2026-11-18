import { fromDateTimeInput, startOfDay, toDateTimeInput } from "@/lib/dates"
import { enUS, ptBR } from "date-fns/locale"
import { i18n } from "@/lib/i18n"
import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarItem,
  CalendarItemColor,
  CalendarRange,
  CalendarVisibleRange,
  EventFormValues,
} from "@/types/calendar"

export const EVENT_COLORS = ["#FF892B", "#8B5CF6", "#3B82F6", "#10B981", "#F43F5E", "#64748B"]

/** The stored color of each of the calendar view's named colors. */
export const EVENT_COLOR_HEX: Record<CalendarItemColor, string> = {
  orange: "#FF892B",
  purple: "#8B5CF6",
  blue: "#3B82F6",
  green: "#10B981",
  red: "#F43F5E",
  gray: "#64748B",
  yellow: "#F59E0B",
}

const NAMED_COLORS = Object.entries(EVENT_COLOR_HEX) as [CalendarItemColor, string][]

function toRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** The named color closest to a stored hex color. */
export function colorName(hex: string): CalendarItemColor {
  const [r, g, b] = toRgb(hex)
  let best = NAMED_COLORS[0]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const entry of NAMED_COLORS) {
    const [er, eg, eb] = toRgb(entry[1])
    const distance = (r - er) ** 2 + (g - eg) ** 2 + (b - eb) ** 2
    if (distance < bestDistance) {
      best = entry
      bestDistance = distance
    }
  }
  return best[0]
}

/** A stored event as the calendar view draws it, under the id the view knows it by. */
export function toCalendarItem(event: CalendarEvent, id = event.id): CalendarItem {
  return {
    id,
    title: event.title,
    start: new Date(event.startAt),
    end: new Date(event.endAt),
    isAllDay: event.allDay,
    color: colorName(event.color),
    description: event.description ?? undefined,
    location: event.location ?? undefined,
  }
}

/** The API body for an event edited in the calendar view. */
export function toEventInput(item: CalendarItem): CalendarEventInput {
  return {
    title: item.title.trim() || i18n.t("calendar.untitled"),
    startAt: item.start.toISOString(),
    endAt: item.end.toISOString(),
    allDay: Boolean(item.isAllDay),
    location: item.location?.trim() || null,
    description: item.description?.trim() || null,
    color: EVENT_COLOR_HEX[item.color ?? "orange"],
  }
}

/** The API range for the dates the calendar view draws. */
export function toCalendarRange(range: CalendarVisibleRange): CalendarRange {
  return { from: range.start.toISOString(), to: new Date(range.end.getTime() - 1).toISOString() }
}

/** The date-fns locale for the app's language, which names days and months in the calendar view. */
export function calendarLocale(language: string | undefined) {
  return language === "pt" ? ptBR : enUS
}

/** A new event for the slot clicked in the calendar view. */
export function newCalendarItem(range: { start: Date; end: Date }): CalendarItem {
  return { id: crypto.randomUUID(), title: i18n.t("calendar.newEvent"), start: range.start, end: range.end, color: "orange" }
}

export function emptyEventValues(start: Date | null): EventFormValues {
  const from = start ?? nextHour()
  return {
    title: "",
    allDay: false,
    start: toDateTimeInput(from),
    end: toDateTimeInput(new Date(from.getTime() + 60 * 60 * 1000)),
    location: "",
    description: "",
    color: EVENT_COLORS[0],
  }
}

export function eventToValues(event: CalendarEvent): EventFormValues {
  return {
    title: event.title,
    allDay: event.allDay,
    start: toDateTimeInput(event.startAt),
    end: toDateTimeInput(event.endAt),
    location: event.location ?? "",
    description: event.description ?? "",
    color: event.color,
  }
}

export function valuesToEventInput(values: EventFormValues): CalendarEventInput {
  const startAt = values.allDay ? startOfDay(new Date(values.start)).toISOString() : fromDateTimeInput(values.start)
  const endAt = values.allDay ? startOfDay(new Date(values.end)).toISOString() : fromDateTimeInput(values.end)
  return {
    title: values.title.trim(),
    allDay: values.allDay,
    startAt,
    endAt,
    location: values.location.trim() || null,
    description: values.description.trim() || null,
    color: values.color,
  }
}

/** The hour after now, as the range "New event" fills. */
export function nextHourRange() {
  const start = nextHour()
  return { start, end: new Date(start.getTime() + 60 * 60 * 1000) }
}

function nextHour() {
  const date = new Date()
  date.setHours(date.getHours() + 1, 0, 0, 0)
  return date
}
