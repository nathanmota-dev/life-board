import { formatDate, fromDayKey, lastDays } from "@/lib/dates"
import type { Habit, HabitChartPoint, HabitDay, HabitLog } from "@/types/habit"

function countOn(logs: HabitLog[], habitId: string, day: string) {
  return logs.find((log) => log.habitId === habitId && log.day === day)?.count ?? 0
}

/** One entry per day (oldest first) with how much was logged and whether the goal was met. */
export function habitWeek(habit: Habit, logs: HabitLog[], days: string[] = lastDays(7)): HabitDay[] {
  return days.map((day) => {
    const count = countOn(logs, habit.id, day)
    return { day, label: formatDate(fromDayKey(day), { weekday: "narrow" }), count, done: count >= habit.target }
  })
}

/** Share of habit-days in the window where the goal was met, 0–100. */
export function completionRate(habits: Habit[], logs: HabitLog[], days: string[] = lastDays(7)) {
  if (habits.length === 0) return 0
  const met = habits.reduce(
    (total, habit) => total + days.filter((day) => countOn(logs, habit.id, day) >= habit.target).length,
    0,
  )
  return Math.round((met / (habits.length * days.length)) * 100)
}

export function goalsMetPerDay(habits: Habit[], logs: HabitLog[], days: string[]): HabitChartPoint[] {
  return days.map((day) => ({
    day,
    label: formatDate(fromDayKey(day)),
    met: habits.filter((habit) => countOn(logs, habit.id, day) >= habit.target).length,
  }))
}

export function habitProgress(habit: Habit) {
  return Math.min(100, Math.round((habit.todayCount / habit.target) * 100))
}
