import { addDays, startOfDay } from "@/lib/dates"
import { i18n } from "@/lib/i18n"
import type { CalendarEvent } from "@/types/calendar"
import type { Task } from "@/types/task"

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

/** Events that haven't ended yet; all-day events count until the end of their day. */
export function nextEvents(events: CalendarEvent[], now = new Date(), limit = 5) {
  return events
    .filter((event) => (event.allDay ? addDays(startOfDay(new Date(event.startAt)), 1) : new Date(event.endAt)) > now)
    .slice(0, limit)
}
