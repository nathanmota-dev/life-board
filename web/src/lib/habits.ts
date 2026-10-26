import { addDays, formatDate, fromDayKey, lastDays, toDayKey } from "@/lib/dates"
import { i18n } from "@/lib/i18n"
import type { Habit, HabitChartPoint, HabitDay, HabitDayStatus, HabitLog } from "@/types/habit"

export const HABIT_EMOJIS = ["🌱", "💧", "🥤", "📚", "🏋️", "🚶", "🧘", "😴", "🥗", "💊", "🧹", "✍️", "🎨", "🎸", "💻", "🐾"]

/** Largest count the API accepts for one day. */
export const MAX_HABIT_COUNT = 1_000_000

export function habitUnit(unit: string) {
  return unit === "times" ? i18n.t("habits.times") : unit
}

export function habitDay(habit: Habit, logs: HabitLog[], day: string): HabitDay {
  const log = logs.find((item) => item.habitId === habit.id && item.day === day)
  const count = day === toDayKey() ? habit.todayCount : log?.count ?? 0
  const target = day === toDayKey() ? habit.target : log?.target ?? habit.target
  const created = habit.createdAt ? toDayKey(new Date(habit.createdAt)) : ""
  const eligible = day <= toDayKey() && (day >= created || !!log)
  return { day, label: formatDate(fromDayKey(day), { weekday: "narrow" }), count, target, eligible, done: eligible && count >= target }
}

export function habitWeek(habit: Habit, logs: HabitLog[], days: string[] = lastDays(7)): HabitDay[] {
  return days.map((day) => habitDay(habit, logs, day))
}

export function habitDayStatus(entry: HabitDay): HabitDayStatus {
  if (!entry.eligible) return "notTracked"
  if (entry.done) return "completed"
  if (entry.count > 0) return "partial"
  return entry.day === toDayKey() ? "pending" : "missed"
}

/** A past or current day can be edited, even before the habit existed, to backfill check-ins. */
export function canEditHabitDay(day: string) {
  return day <= toDayKey()
}

/** The seven day keys of the week starting at `weekStart`. */
export function weekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, index) => toDayKey(addDays(weekStart, index)))
}

/** Only days on/after creation count; today remains in progress until its goal is met. */
export function completionRate(habits: Habit[], logs: HabitLog[], days: string[] = lastDays(7)) {
  const entries = habits.flatMap((habit) => habitWeek(habit, logs, days)).filter((day) => day.eligible)
  return entries.length ? Math.round(entries.filter((day) => day.done).length / entries.length * 100) : 0
}

export function goalsMetPerDay(habits: Habit[], logs: HabitLog[], days: string[]): HabitChartPoint[] {
  return days.map((day) => {
    const entries = habits.map((habit) => habitDay(habit, logs, day)).filter((entry) => entry.eligible)
    const empty = entries.filter((entry) => entry.count === 0).length
    return {
      day, label: formatDate(fromDayKey(day)),
      met: entries.filter((entry) => entry.done).length,
      partial: entries.filter((entry) => !entry.done && entry.count > 0).length,
      missed: day < toDayKey() ? empty : 0,
      pending: day === toDayKey() ? empty : 0,
    }
  })
}

export function habitProgress(habit: Habit) {
  return Math.min(100, Math.round((habit.todayCount / habit.target) * 100))
}
