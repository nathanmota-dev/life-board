import { addDays, fromDateTimeInput, minutesSinceMidnight, startOfDay, toDateTimeInput, toDayKey } from "@/lib/dates"
import type { CalendarEvent, CalendarEventInput, EventFormValues, PositionedEvent, WeekLayout } from "@/types/calendar"

export const START_HOUR = 6
export const END_HOUR = 24
export const HOUR_HEIGHT = 56
export const EVENT_COLORS = ["#FF892B", "#8B5CF6", "#3B82F6", "#10B981", "#F43F5E", "#64748B"]

export const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, index) => START_HOUR + index)

export function weekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
}

export function weekRange(weekStart: Date) {
  return { from: weekStart.toISOString(), to: new Date(addDays(weekStart, 7).getTime() - 1).toISOString() }
}

export function minuteToOffset(minute: number) {
  return ((minute - START_HOUR * 60) / 60) * HOUR_HEIGHT
}

/** Splits overlapping events into side-by-side lanes so none of them hide each other. */
function assignLanes(items: Omit<PositionedEvent, "lane" | "lanes">[]): PositionedEvent[] {
  const sorted = [...items].sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute)
  const result: PositionedEvent[] = []
  let cluster: PositionedEvent[] = []
  let clusterEnd = -1

  const closeCluster = () => {
    const lanes = Math.max(1, ...cluster.map((item) => item.lane + 1))
    for (const item of cluster) result.push({ ...item, lanes })
    cluster = []
  }

  for (const item of sorted) {
    if (item.startMinute >= clusterEnd) {
      closeCluster()
      clusterEnd = -1
    }
    const taken = new Set(cluster.filter((other) => other.endMinute > item.startMinute).map((other) => other.lane))
    let lane = 0
    while (taken.has(lane)) lane++
    cluster.push({ ...item, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, item.endMinute)
  }
  closeCluster()
  return result
}

export function layoutWeek(events: CalendarEvent[], days: Date[]): WeekLayout {
  const keys = days.map((day) => toDayKey(day))
  const allDay: CalendarEvent[][] = days.map(() => [])
  const timed: Omit<PositionedEvent, "lane" | "lanes">[][] = days.map(() => [])

  for (const event of events) {
    const start = new Date(event.startAt)
    const dayIndex = keys.indexOf(toDayKey(start))
    if (dayIndex === -1) continue
    if (event.allDay) {
      allDay[dayIndex].push(event)
      continue
    }
    const end = new Date(event.endAt)
    const startMinute = Math.max(START_HOUR * 60, minutesSinceMidnight(start))
    const endMinute = toDayKey(end) === keys[dayIndex] ? minutesSinceMidnight(end) : END_HOUR * 60
    timed[dayIndex].push({ event, dayIndex, startMinute, endMinute: Math.max(endMinute, startMinute + 20) })
  }
  return { allDay, timed: timed.map(assignLanes) }
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

function nextHour() {
  const date = new Date()
  date.setHours(date.getHours() + 1, 0, 0, 0)
  return date
}
