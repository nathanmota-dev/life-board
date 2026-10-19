import { addDays, formatDate, fromDayKey, lastDays, toDayKey } from "@/lib/dates"
import { i18n } from "@/lib/i18n"
import type { Habit, HabitChartPoint, HabitDay, HabitLog } from "@/types/habit"

export const HABIT_EMOJIS = ["🌱", "💧", "🥤", "📚", "🏋️", "🚶", "🧘", "😴", "🥗", "💊", "🧹", "✍️", "🎨", "🎸", "💻", "🐾"]

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

export function habitDateRange(from: string, to: string): string[] {
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
