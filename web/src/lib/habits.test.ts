import { describe, expect, it } from "vitest"
import { completionRate, goalsMetPerDay, habitProgress, habitWeek } from "@/lib/habits"
import type { Habit, HabitLog } from "@/types/habit"

const habit: Habit = { id: "h1", name: "Water", unit: "glasses", target: 2, todayCount: 3, doneToday: true, streak: 1, createdAt: "" }
const days = ["2026-10-15", "2026-10-16", "2026-10-17"]
const logs: HabitLog[] = [
  { habitId: "h1", day: "2026-10-15", count: 2 },
  { habitId: "h1", day: "2026-10-17", count: 1 },
  { habitId: "other", day: "2026-10-16", count: 9 },
]

describe("habit helpers", () => {
  it("builds the per-day history for one habit", () => {
    expect(habitWeek(habit, logs, days).map(({ day, count, done }) => [day, count, done])).toEqual([
      ["2026-10-15", 2, true],
      ["2026-10-16", 0, false],
      ["2026-10-17", 1, false],
    ])
  })

  it("computes completion rate and goals met per day", () => {
    expect(completionRate([habit], logs, days)).toBe(33)
    expect(completionRate([], logs, days)).toBe(0)
    expect(goalsMetPerDay([habit], logs, days).map((point) => point.met)).toEqual([1, 0, 0])
  })

  it("caps today's progress at 100%", () => {
    expect(habitProgress(habit)).toBe(100)
    expect(habitProgress({ ...habit, todayCount: 1 })).toBe(50)
  })
})
