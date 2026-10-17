import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { calendarEvents, goalMilestones, goals, habitLogs, habits, tasks, thoughts } from "../db/schema"
import { createTestDb } from "../test/create-test-app"
import { StatsService } from "./stats.service"

let ctx: Awaited<ReturnType<typeof createTestDb>>

beforeEach(async () => {
  ctx = await createTestDb()
})
afterEach(() => ctx.cleanup())

describe("StatsService", () => {
  it("counts this week's activity, from Sunday to Saturday", async () => {
    // Saturday Oct 17 2026; the week starts on Sunday Oct 11.
    const now = new Date(2026, 9, 17, 12)
    const inWeek = new Date(2026, 9, 12)
    const lastWeek = new Date(2026, 9, 9)

    await ctx.db.insert(thoughts).values([
      { id: "th1", createdAt: inWeek },
      { id: "th2", createdAt: lastWeek },
      { id: "th3", createdAt: inWeek, deletedAt: inWeek },
    ])
    await ctx.db.insert(tasks).values([
      { id: "t1", title: "a", completedAt: inWeek },
      { id: "t2", title: "b", completedAt: lastWeek },
      { id: "t3", title: "c" },
    ])
    await ctx.db.insert(calendarEvents).values({ id: "e1", title: "e", startAt: inWeek, endAt: inWeek })
    await ctx.db.insert(goals).values({ id: "g1", title: "g" })
    await ctx.db.insert(goalMilestones).values({ id: "m1", goalId: "g1", title: "m", completedAt: inWeek })
    await ctx.db.insert(habits).values([
      { id: "h1", name: "Water", target: 2 },
      { id: "h2", name: "Gone", target: 1, deletedAt: inWeek },
    ])
    await ctx.db.insert(habitLogs).values([
      { id: "l1", habitId: "h1", day: "2026-10-12", count: 2 },
      { id: "l2", habitId: "h1", day: "2026-10-13", count: 1 },
      { id: "l3", habitId: "h1", day: "2026-10-09", count: 5 },
      { id: "l4", habitId: "h2", day: "2026-10-12", count: 1 },
    ])

    expect(await new StatsService(ctx.db).thisWeek(now)).toEqual({
      weekStart: new Date(2026, 9, 11).toISOString(),
      thoughtsCreated: 1,
      tasksCompleted: 1,
      eventsCount: 1,
      milestonesHit: 1,
      habitGoalsMet: 1,
    })
  })

  it("defaults to the current week", async () => {
    expect((await new StatsService(ctx.db).thisWeek()).thoughtsCreated).toBe(0)
  })
})
