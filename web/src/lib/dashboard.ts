import { addDays, startOfDay, toDayKey } from "@/lib/dates"
import { i18n } from "@/lib/i18n"
import { matchesChip } from "@/lib/tasks"
import type { CalendarEvent } from "@/types/calendar"
import {
  DASHBOARD_WIDGETS,
  type DashboardLayout,
  type DashboardWidgetId,
  type DaySummaryCounts,
  type DayTimeline,
  type FocusRolloverPlan,
  type TimelineItem,
} from "@/types/dashboard"
import type { Habit } from "@/types/habit"
import type { Task } from "@/types/task"

export const FOCUS_LIMIT = 3

export function greeting(now = new Date()) {
  const hour = now.getHours()
  return hour < 12 ? i18n.t("dashboard.goodMorning") : hour < 18 ? i18n.t("dashboard.goodAfternoon") : i18n.t("dashboard.goodEvening")
}

/** Today's plan: tasks marked for today plus anything due today or overdue. */
export function tasksForToday(tasks: Task[], now = new Date()) {
  const tomorrow = addDays(startOfDay(now), 1)
  return tasks.filter(
    (task) => task.status !== "done" && (task.status === "today" || (task.dueAt !== null && new Date(task.dueAt) < tomorrow)),
  )
}

export function upcomingRange(now = new Date()) {
  return { from: startOfDay(now).toISOString(), to: addDays(startOfDay(now), 7).toISOString() }
}

/** Events starting today, from midnight to the last millisecond of the day. */
export function todayRange(now = new Date()) {
  return { from: startOfDay(now).toISOString(), to: new Date(addDays(startOfDay(now), 1).getTime() - 1).toISOString() }
}

/**
 * Today's events for the timeline: all-day ones apart, timed ones by start time. Events that
 * ended are past, running ones current, and the first one still ahead is next. The "now" line
 * goes after every event that already started.
 */
export function dayTimeline(events: CalendarEvent[], now = new Date()): DayTimeline {
  const timed = events
    .filter((event) => !event.allDay)
    .sort((a, b) => a.startAt.localeCompare(b.startAt) || a.endAt.localeCompare(b.endAt))
  let nextFound = false
  const items = timed.map<TimelineItem>((event) => {
    if (new Date(event.endAt) <= now) return { event, state: "past" }
    if (new Date(event.startAt) <= now) return { event, state: "current" }
    if (nextFound) return { event, state: "upcoming" }
    nextFound = true
    return { event, state: "next" }
  })
  return {
    allDay: events.filter((event) => event.allDay),
    items,
    nowIndex: timed.filter((event) => new Date(event.startAt) <= now).length,
  }
}

/** "in 25 min", "in 2 h", "in 1 h 5 min": the time left until `start`, rounded up to the minute. */
export function countdown(start: string | Date, now = new Date()) {
  const minutes = Math.max(1, Math.ceil((new Date(start).getTime() - now.getTime()) / 60_000))
  if (minutes < 60) return i18n.t("dashboard.inMinutes", { count: minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? i18n.t("dashboard.inHours", { hours }) : i18n.t("dashboard.inHoursMinutes", { hours, minutes: rest })
}

/** Open tasks for today, overdue or upcoming that aren't in today's focus yet, matching the search. */
export function focusCandidates(tasks: Task[], focusIds: string[], search = "", now = new Date()) {
  const term = search.trim().toLowerCase()
  return tasks.filter(
    (task) =>
      !focusIds.includes(task.id) &&
      (matchesChip(task, "today", now) || matchesChip(task, "overdue", now) || matchesChip(task, "upcoming", now)) &&
      (!term || task.title.toLowerCase().includes(term)),
  )
}

/** The focus tasks of `focus` still open, offered again the next day. */
export function unfinishedFocus(focus: Task[]) {
  return focus.filter((task) => task.status !== "done")
}

/** Keeping yesterday's focus moves as many tasks as today has free slots; the rest leave the focus. */
export function planFocusRollover(unfinished: Task[], freeSlots: number): FocusRolloverPlan {
  const slots = Math.max(0, freeSlots)
  return { keep: unfinished.slice(0, slots), drop: unfinished.slice(slots) }
}

/** Habits still to do first, met ones at the end, each group in its original order. */
export function sortHabitsForDay(habits: Habit[]) {
  return [...habits.filter((habit) => !habit.doneToday), ...habits.filter((habit) => habit.doneToday)]
}

export function daySummary(doneTasks: Task[], habits: Habit[], events: CalendarEvent[], now = new Date()): DaySummaryCounts {
  const today = toDayKey(now)
  return {
    tasksCompleted: doneTasks.filter((task) => task.completedAt !== null && toDayKey(new Date(task.completedAt)) === today).length,
    habitsMet: habits.filter((habit) => habit.doneToday).length,
    habitsTotal: habits.length,
    // Events that already started today; all-day ones count from midnight.
    eventsHeld: events.filter((event) => toDayKey(new Date(event.startAt)) === today && new Date(event.startAt) <= now).length,
  }
}

export const DASHBOARD_LAYOUT_STORAGE_KEY = "life-board-dashboard-layout"

export function defaultDashboardLayout(): DashboardLayout {
  return { order: [...DASHBOARD_WIDGETS], hidden: [] }
}

function isWidgetId(value: unknown): value is DashboardWidgetId {
  return DASHBOARD_WIDGETS.includes(value as DashboardWidgetId)
}

/** A layout from storage, without unknown or repeated widgets; widgets it doesn't list go at the end. */
export function normalizeDashboardLayout(value: unknown): DashboardLayout {
  const raw = (value ?? {}) as Partial<Record<keyof DashboardLayout, unknown>>
  const known = (list: unknown) => [...new Set(Array.isArray(list) ? list.filter(isWidgetId) : [])]
  const order = known(raw.order)
  return { order: [...order, ...DASHBOARD_WIDGETS.filter((id) => !order.includes(id))], hidden: known(raw.hidden) }
}

export function readDashboardLayout(): DashboardLayout {
  try {
    const stored = window.localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY)
    return stored ? normalizeDashboardLayout(JSON.parse(stored)) : defaultDashboardLayout()
  } catch {
    return defaultDashboardLayout()
  }
}

export function saveDashboardLayout(layout: DashboardLayout) {
  try {
    window.localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Storage can be unavailable; the layout then lasts until the page reloads.
  }
}

export function toggleWidget(layout: DashboardLayout, id: DashboardWidgetId): DashboardLayout {
  const hidden = layout.hidden.includes(id) ? layout.hidden.filter((item) => item !== id) : [...layout.hidden, id]
  return { ...layout, hidden }
}

/** Moves a widget one place up (-1) or down (1); the ends stay put. */
export function moveWidget(layout: DashboardLayout, id: DashboardWidgetId, offset: -1 | 1): DashboardLayout {
  const from = layout.order.indexOf(id)
  const to = from + offset
  if (from === -1 || to < 0 || to >= layout.order.length) return layout
  const order = layout.order.filter((item) => item !== id)
  order.splice(to, 0, id)
  return { ...layout, order }
}

export function visibleWidgets(layout: DashboardLayout) {
  return layout.order.filter((id) => !layout.hidden.includes(id))
}

/** In the two-column grid, the last widget of an odd count is alone on its row and takes all of it. */
export function isAloneOnRow(index: number, count: number) {
  return count % 2 === 1 && index === count - 1
}

export function widgetLabel(id: DashboardWidgetId) {
  return i18n.t(`dashboard.widgets.${id}`)
}
