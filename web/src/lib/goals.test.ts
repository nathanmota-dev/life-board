import { afterEach, describe, expect, it } from "vitest"
import {
  countAtRisk,
  formatBreakdown,
  GOAL_DOMAIN_COLORS,
  GOAL_LAYOUT_STORAGE_KEY,
  groupByDomain,
  hasProgressParts,
  isScheduled,
  progressSeries,
  readGoalLayout,
  saveGoalLayout,
  timelineBar,
  timelinePosition,
  timelineScale,
  valuesToGoalInput,
} from "@/lib/goals"
import { goalFixture } from "@/test/goal-fixtures"

afterEach(() => localStorage.clear())

describe("timeline scale", () => {
  const today = new Date(2026, 9, 15)

  it("aligns to whole months around the goals, their milestones and today", () => {
    const goals = [
      goalFixture({ startAt: new Date(2026, 9, 10).toISOString(), targetAt: new Date(2026, 10, 20).toISOString() }),
      goalFixture({
        id: "g2",
        startAt: null,
        createdAt: new Date(2026, 8, 5).toISOString(),
        targetAt: new Date(2026, 9, 30).toISOString(),
        milestoneMarkers: [{ id: "m", title: "Halfway", dueAt: new Date(2026, 11, 2).toISOString(), completedAt: null }],
      }),
    ]
    const scale = timelineScale(goals, today)

    expect(scale.start).toBe(new Date(2026, 8, 1).getTime())
    expect(scale.end).toBe(new Date(2027, 0, 1).getTime())
    expect(scale.months.map((month) => month.key)).toEqual(["2026-8", "2026-9", "2026-10", "2026-11"])
    expect(scale.months[0].left).toBe(0)
    expect(scale.months.reduce((sum, month) => sum + month.width, 0)).toBeCloseTo(100)
    expect(scale.today).toBeGreaterThan(scale.months[1].left)
    expect(scale.today).toBeLessThan(scale.months[2].left)
  })

  it("includes today even when every goal is in the past", () => {
    const scale = timelineScale([goalFixture({ startAt: new Date(2026, 0, 5).toISOString(), targetAt: new Date(2026, 1, 1).toISOString() })], today)
    expect(scale.months.at(-1)?.key).toBe("2026-9")
    expect(timelineScale([], today).months.map((month) => month.key)).toEqual(["2026-9"])
  })

  it("places bars from start to target and clamps positions", () => {
    const scale = timelineScale([], today)
    const goal = goalFixture({ startAt: new Date(2026, 9, 1).toISOString(), targetAt: new Date(2026, 9, 16, 12).toISOString() })
    expect(timelineBar(scale, goal)).toEqual({ left: 0, width: 50 })
    expect(timelinePosition(scale, new Date(2025, 0, 1))).toBe(0)
    expect(timelinePosition(scale, new Date(2027, 0, 1))).toBe(100)
    expect(timelineBar(scale, goalFixture({ startAt: new Date(2026, 9, 5).toISOString(), targetAt: new Date(2026, 9, 5).toISOString() })).width).toBe(0.5)
  })
})

describe("goal helpers", () => {
  it("counts goals at risk or overdue", () => {
    expect(countAtRisk([goalFixture(), goalFixture({ risk: "at_risk" }), goalFixture({ risk: "overdue" })])).toBe(2)
  })

  it("formats the progress breakdown", () => {
    const breakdown = { milestones: { done: 2, total: 4 }, tasks: { done: 5, total: 8 }, habits: { done: 18, total: 25 } }
    expect(formatBreakdown(breakdown)).toBe("Milestones 2/4 · Tasks 5/8 · Habits 72%")
    expect(formatBreakdown({ milestones: null, tasks: null, habits: { done: 0, total: 0 } })).toBe("Habits 0%")
    expect(hasProgressParts({ milestones: null, tasks: null, habits: null })).toBe(false)
  })

  it("groups by domain in order and separates undated goals", () => {
    const goals = [goalFixture({ id: "a", domain: "personal" }), goalFixture({ id: "b", domain: "health", targetAt: null })]
    expect(groupByDomain(goals).map((group) => group.domain)).toEqual(["health", "personal"])
    expect(goals.filter(isScheduled).map((goal) => goal.id)).toEqual(["a"])
  })

  it("uses the accent chart tokens for domains", () => {
    expect(Object.values(GOAL_DOMAIN_COLORS)).toEqual(["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"])
  })

  it("carries progress forward over days without a snapshot", () => {
    const history = { items: [{ day: "2026-10-03", progress: 40 }, { day: "2026-10-05", progress: 55 }], startingProgress: 30 }
    expect(progressSeries(history, ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]).map((point) => point.progress)).toEqual([30, 40, 40, 55])
    expect(progressSeries({ items: [], startingProgress: null }, ["2026-10-02"])[0].progress).toBeNull()
  })

  it("sends start dates and linked habits from the form", () => {
    const input = valuesToGoalInput({ title: " Read ", why: "", domain: "learning", startAt: "2026-10-01", targetAt: "", milestones: "A\n\nB", linkedTaskIds: [], linkedHabitIds: ["h1"] })
    expect(input).toMatchObject({ title: "Read", why: null, startAt: new Date(2026, 9, 1).toISOString(), targetAt: null, linkedHabitIds: ["h1"], milestones: [{ title: "A" }, { title: "B" }] })
  })

  it("remembers the layout", () => {
    expect(readGoalLayout()).toBe("grid")
    saveGoalLayout("timeline")
    expect(localStorage.getItem(GOAL_LAYOUT_STORAGE_KEY)).toBe("timeline")
    expect(readGoalLayout()).toBe("timeline")
  })
})
