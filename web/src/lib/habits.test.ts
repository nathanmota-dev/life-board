import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dayRange } from "@/lib/dates"
import { canEditHabitDay, completionRate, goalsMetPerDay, habitDay, habitDayStatus, habitProgress, habitWeek, weekDays } from "@/lib/habits"
import type { Habit, HabitLog } from "@/types/habit"

const habit: Habit = { id: "h1", name: "Water", unit: "glasses", target: 2, step: 1, emoji: "💧", todayCount: 3, doneToday: true, streak: 1, createdAt: "" }
const days = ["2026-10-15", "2026-10-16", "2026-10-17"]
const logs: HabitLog[] = [
  { habitId: "h1", day: "2026-10-15", count: 2 },
  { habitId: "h1", day: "2026-10-17", count: 1 },
  { habitId: "other", day: "2026-10-16", count: 9 },
]

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 18, 12)) })
afterEach(() => vi.useRealTimers())

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

describe("habit history windows", () => {
  it("excludes days before creation from completion and missed totals", () => {
    const recent = { ...habit, createdAt: "2026-10-17T12:00:00.000Z" }
    expect(completionRate([recent], logs.filter((log) => log.day !== "2026-10-15"), days)).toBe(0)
    expect(goalsMetPerDay([recent], logs.filter((log) => log.day !== "2026-10-15"), days).map((point) => point.missed)).toEqual([0, 0, 0])
    expect(completionRate([{ ...recent, id: "new" }], [], ["2026-10-15"])).toBe(0)
  })

  it("keeps previous targets and uses the current target and count for today", () => {
    const changed = { ...habit, target: 10, todayCount: 2 }
    const history = [{ habitId: habit.id, day: "2026-10-17", count: 2, target: 2 }]
    expect(completionRate([changed], history, ["2026-10-17"])).toBe(100)
    expect(habitWeek(changed, history, ["2026-10-18"])[0]).toMatchObject({ count: 2, target: 10, done: false })
    expect(goalsMetPerDay([{ ...changed, todayCount: 0 }], [], ["2026-10-18"])[0]).toMatchObject({ missed: 0, pending: 1 })
  })

  it("validates custom dates and crosses month boundaries", () => {
    expect(dayRange("2026-09-29", "2026-10-02")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"])
    for (const [from, to] of [["", "2026-10-18"], ["2026-02-30", "2026-03-01"], ["2026-10-18", "2026-10-17"], ["2026-10-17", "2026-10-19"], ["2024-01-01", "2026-10-18"]]) {
      expect(dayRange(from, to)).toEqual([])
    }
  })
})

describe("editing habit days", () => {
  it("names each day's status", () => {
    expect(["2026-10-15", "2026-10-16", "2026-10-17"].map((day) => habitDayStatus(habitDay(habit, logs, day)))).toEqual(["completed", "missed", "partial"])
    expect(habitDayStatus(habitDay({ ...habit, todayCount: 0 }, logs, "2026-10-18"))).toBe("pending")
    expect(habitDayStatus(habitDay({ ...habit, createdAt: "2026-10-17T12:00:00.000Z" }, [], "2026-10-16"))).toBe("notTracked")
  })

  it("allows editing today and past days only", () => {
    expect(canEditHabitDay("2026-01-01")).toBe(true)
    expect(canEditHabitDay("2026-10-18")).toBe(true)
    expect(canEditHabitDay("2026-10-19")).toBe(false)
  })

  it("lists the seven days of a week across month boundaries", () => {
    expect(weekDays(new Date(2026, 9, 25))).toEqual(["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"])
    expect(weekDays(new Date(2026, 10, 29)).at(-1)).toBe("2026-12-05")
  })
})
