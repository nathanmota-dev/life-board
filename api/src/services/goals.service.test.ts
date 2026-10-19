import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { goalProgressSnapshots, goals, habitLogs, habits, tasks, type Goal } from "../db/schema"
import { createTestDb } from "../test/create-test-app"
import { addDays, toDayKey } from "./date.service"
import { NotFoundError } from "./errors"
import { autoProgress, goalRisk, GoalsService, habitsPart } from "./goals.service"

let ctx: Awaited<ReturnType<typeof createTestDb>>
let service: GoalsService

beforeEach(async () => {
  ctx = await createTestDb()
  service = new GoalsService(ctx.db)
})
afterEach(() => ctx.cleanup())

const goal = (extra: Partial<Goal> = {}): Goal => ({
  id: "g1",
  title: "Goal",
  why: null,
  domain: "personal",
  status: "active",
  startAt: new Date(2026, 9, 1),
  targetAt: new Date(2026, 9, 31),
  completedAt: null,
  color: "#a855f7",
  progress: 0,
  progressMode: "auto",
  linkedTaskIds: [],
  linkedThoughtIds: [],
  linkedHabitIds: [],
  createdAt: new Date(2026, 8, 1),
  updatedAt: new Date(2026, 8, 1),
  deletedAt: null,
  ...extra,
})

const addTask = async (id: string, status: "today" | "done") => {
  await ctx.db.insert(tasks).values({ id, title: id, status })
}

const addHabit = async (id: string, target: number, createdAt: Date) => {
  await ctx.db.insert(habits).values({ id, name: id, target, createdAt })
}

const logHabit = (habitId: string, day: string, count: number, target: number | null = null) =>
  ctx.db.insert(habitLogs).values({ id: `${habitId}-${day}`, habitId, day, count, target })

const snapshotsOf = (goalId: string) =>
  ctx.db.select().from(goalProgressSnapshots).where(eq(goalProgressSnapshots.goalId, goalId))

describe("autoProgress", () => {
  it("averages the parts the goal has", () => {
    expect(autoProgress({ milestones: { done: 1, total: 4 }, tasks: null, habits: null })).toBe(25)
    expect(autoProgress({ milestones: { done: 1, total: 2 }, tasks: { done: 1, total: 1 }, habits: null })).toBe(75)
    expect(autoProgress({ milestones: null, tasks: null, habits: { done: 0, total: 0 } })).toBe(0)
  })

  it("sits at 0% without parts", () => {
    expect(autoProgress({ milestones: null, tasks: null, habits: null })).toBe(0)
  })
})

describe("habitsPart", () => {
  const today = new Date(2026, 9, 10, 15)

  it("counts met days since the goal's start, with today only once it's met", () => {
    const water = { id: "water", target: 2, createdAt: new Date(2026, 8, 1) }
    const logs = [
      { habitId: "water", day: "2026-09-30", count: 5, target: 2 },
      { habitId: "water", day: "2026-10-01", count: 2, target: 2 },
      { habitId: "water", day: "2026-10-02", count: 1, target: 2 },
      { habitId: "water", day: "2026-10-03", count: 1, target: 1 },
      { habitId: "water", day: "2026-10-10", count: 1, target: null },
    ]
    expect(habitsPart(goal(), [water], logs, today)).toEqual({ done: 2, total: 9 })
    expect(habitsPart(goal(), [water], [...logs.slice(0, 4), { habitId: "water", day: "2026-10-10", count: 2, target: null }], today))
      .toEqual({ done: 3, total: 10 })
  })

  it("uses the creation date without a start date and skips days before the habit existed", () => {
    const late = { id: "late", target: 1, createdAt: new Date(2026, 9, 8) }
    expect(habitsPart(goal({ startAt: null, createdAt: new Date(2026, 9, 5) }), [late], [], today)).toEqual({ done: 0, total: 2 })
    const early = { id: "early", target: 1, createdAt: new Date(2026, 0, 1) }
    expect(habitsPart(goal({ startAt: null, createdAt: new Date(2026, 9, 5) }), [early], [], today)).toEqual({ done: 0, total: 5 })
  })

  it("is empty for a goal that hasn't started", () => {
    const habit = { id: "h", target: 1, createdAt: new Date(2026, 0, 1) }
    expect(habitsPart(goal({ startAt: new Date(2026, 9, 20) }), [habit], [], today)).toEqual({ done: 0, total: 0 })
  })
})

describe("goalRisk", () => {
  const now = new Date(2026, 9, 16)

  it("compares progress with the elapsed share of the timeline", () => {
    expect(goalRisk(goal(), 50, now)).toEqual({ expectedProgress: 50, risk: null })
    expect(goalRisk(goal(), 40, now)).toEqual({ expectedProgress: 50, risk: null })
    expect(goalRisk(goal(), 39, now)).toEqual({ expectedProgress: 50, risk: "at_risk" })
  })

  it("flags active goals past their target below 100%", () => {
    const late = new Date(2026, 10, 2)
    expect(goalRisk(goal(), 90, late)).toEqual({ expectedProgress: 100, risk: "overdue" })
    expect(goalRisk(goal(), 100, late).risk).toBeNull()
    expect(goalRisk(goal({ status: "paused" }), 10, late).risk).toBeNull()
  })

  it("starts from the creation date and handles missing or inverted dates", () => {
    expect(goalRisk(goal({ targetAt: null }), 0, now)).toEqual({ expectedProgress: null, risk: null })
    expect(goalRisk(goal({ startAt: null, createdAt: new Date(2026, 9, 11) }), 0, now).expectedProgress).toBe(25)
    expect(goalRisk(goal({ startAt: new Date(2026, 10, 1) }), 0, now).expectedProgress).toBe(100)
    expect(goalRisk(goal({ startAt: new Date(2026, 9, 20) }), 0, now)).toEqual({ expectedProgress: 0, risk: null })
  })
})

describe("GoalsService", () => {
  it("creates a goal with ordered milestones", async () => {
    const { goal, milestonesCreated } = await service.create({
      title: "Run a marathon",
      milestones: [{ title: "5k" }, { title: "10k", dueAt: new Date(2026, 11, 1) }],
    })

    expect(milestonesCreated).toBe(2)
    expect(goal.progressMode).toBe("auto")
    expect(goal.milestoneMarkers).toEqual([{ id: expect.any(String), title: "10k", dueAt: new Date(2026, 11, 1), completedAt: null }])
    const { milestones } = await service.get(goal.id)
    expect(milestones.map((m) => [m.title, m.order])).toEqual([
      ["5k", 0],
      ["10k", 1],
    ])
    expect(await service.list()).toHaveLength(1)
    expect((await service.create({ title: "No milestones" })).milestonesCreated).toBe(0)
  })

  it("stamps completedAt only while completed", async () => {
    const { goal } = await service.create({ title: "Goal", progressMode: "manual" })

    expect((await service.update(goal.id, { status: "completed" })).completedAt).toBeInstanceOf(Date)
    const custom = new Date(2026, 0, 2)
    expect((await service.update(goal.id, { status: "completed", completedAt: custom })).completedAt).toEqual(custom)
    expect((await service.update(goal.id, { status: "paused" })).completedAt).toBeNull()
    expect((await service.update(goal.id, { progress: 40 })).progress).toBe(40)
  })

  it("derives auto progress from milestones alone", async () => {
    const { goal } = await service.create({ title: "Goal", milestones: [{ title: "A" }, { title: "B" }] })
    expect(goal).toMatchObject({ progress: 0, breakdown: { milestones: { done: 0, total: 2 }, tasks: null, habits: null } })

    const { milestones } = await service.get(goal.id)
    await service.updateMilestone(goal.id, milestones[0].id, { completedAt: new Date() })
    expect((await service.get(goal.id)).goal.progress).toBe(50)
  })

  it("derives auto progress from linked tasks alone, ignoring deleted ones", async () => {
    await addTask("t1", "done")
    await addTask("t2", "today")
    await addTask("t3", "done")
    await ctx.db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, "t3"))
    const { goal } = await service.create({ title: "Goal", linkedTaskIds: ["t1", "t2", "t3", "missing"] })

    expect(goal).toMatchObject({ progress: 50, breakdown: { milestones: null, tasks: { done: 1, total: 2 }, habits: null } })
  })

  it("derives auto progress from habits since the start date", async () => {
    const now = new Date(2026, 9, 5, 12)
    await addHabit("water", 2, new Date(2026, 8, 1))
    await logHabit("water", "2026-09-30", 2, 2)
    await logHabit("water", "2026-10-01", 2, 2)
    await logHabit("water", "2026-10-02", 3, 2)
    await logHabit("water", "2026-10-03", 1, 2)
    const { goal } = await service.create({ title: "Hydrate", startAt: new Date(2026, 9, 1), linkedHabitIds: ["water"] })

    const { goal: summary } = await service.get(goal.id, now)
    expect(summary.breakdown.habits).toEqual({ done: 2, total: 4 })
    expect(summary.progress).toBe(50)
  })

  it("combines milestones, tasks and habits, and shows 0% without parts", async () => {
    const now = new Date(2026, 9, 3, 12)
    await addTask("t1", "done")
    await addHabit("read", 1, new Date(2026, 8, 1))
    await logHabit("read", "2026-10-01", 1)
    const { goal } = await service.create({
      title: "Everything",
      startAt: new Date(2026, 9, 1),
      linkedTaskIds: ["t1"],
      linkedHabitIds: ["read"],
      milestones: [{ title: "A" }, { title: "B" }],
    })
    const { goal: empty } = await service.create({ title: "Empty" })

    const items = await service.list(now)
    // (0/2 + 1/1 + 1/2) / 3
    expect(items.find((item) => item.id === goal.id)?.progress).toBe(50)
    expect(items.find((item) => item.id === empty.id)).toMatchObject({ progress: 0, breakdown: { milestones: null, tasks: null, habits: null } })
  })

  it("keeps manual progress and switches between modes both ways", async () => {
    const { goal } = await service.create({ title: "Goal", milestones: [{ title: "A" }] })
    expect((await service.update(goal.id, { progressMode: "manual", progress: 70 })).progress).toBe(70)
    expect((await service.update(goal.id, { progressMode: "auto" })).progress).toBe(0)
    expect((await service.update(goal.id, { progressMode: "manual" })).progress).toBe(70)
  })

  it("records today's snapshot only when progress changes", async () => {
    const { goal } = await service.create({ title: "Goal", progressMode: "manual" })
    await service.list()
    expect((await snapshotsOf(goal.id)).map((row) => row.progress)).toEqual([0])

    await service.update(goal.id, { progress: 30 })
    await service.update(goal.id, { progress: 60 })
    await service.get(goal.id)
    expect((await snapshotsOf(goal.id)).map((row) => [row.day, row.progress])).toEqual([[toDayKey(), 60]])

    await ctx.db.update(goalProgressSnapshots).set({ day: "2026-01-01" }).where(eq(goalProgressSnapshots.goalId, goal.id))
    await service.get(goal.id)
    expect(await snapshotsOf(goal.id)).toHaveLength(1)
    await service.update(goal.id, { progress: 80 })
    expect((await snapshotsOf(goal.id)).map((row) => row.progress).sort()).toEqual([60, 80])
  })

  it("updates snapshots on milestone writes", async () => {
    const { goal } = await service.create({ title: "Goal", milestones: [{ title: "A" }] })
    const second = await service.addMilestone(goal.id, { title: "B" })
    await service.updateMilestone(goal.id, second.id, { completedAt: new Date() })
    expect((await snapshotsOf(goal.id))[0].progress).toBe(50)
    await service.removeMilestone(goal.id, second.id)
    expect((await snapshotsOf(goal.id))[0].progress).toBe(0)
  })

  it("returns the progress history within a range with the value carried into it", async () => {
    const { goal } = await service.create({ title: "Goal" })
    await ctx.db.delete(goalProgressSnapshots)
    await ctx.db.insert(goalProgressSnapshots).values([
      { id: "s1", goalId: goal.id, day: "2026-09-20", progress: 10 },
      { id: "s2", goalId: goal.id, day: "2026-10-02", progress: 20 },
      { id: "s3", goalId: goal.id, day: "2026-10-09", progress: 35 },
    ])

    expect(await service.progressHistory(goal.id, { from: "2026-10-01", to: "2026-10-05" })).toEqual({
      items: [{ day: "2026-10-02", progress: 20 }],
      startingProgress: 10,
    })
    expect(await service.progressHistory(goal.id, {})).toEqual({
      items: [
        { day: "2026-09-20", progress: 10 },
        { day: "2026-10-02", progress: 20 },
        { day: "2026-10-09", progress: 35 },
      ],
      startingProgress: null,
    })
    expect((await service.progressHistory(goal.id, { from: "2026-01-01" })).startingProgress).toBeNull()
  })

  it("removes snapshots with the goal", async () => {
    const { goal } = await service.create({ title: "Goal" })
    expect(await snapshotsOf(goal.id)).toHaveLength(1)
    await service.remove(goal.id)
    expect(await snapshotsOf(goal.id)).toEqual([])

    await ctx.db.insert(goals).values({ id: "hard", title: "Hard" })
    await ctx.db.insert(goalProgressSnapshots).values({ id: "s", goalId: "hard", day: toDayKey(addDays(new Date(), -1)), progress: 5 })
    await ctx.db.delete(goals).where(eq(goals.id, "hard"))
    expect(await snapshotsOf("hard")).toEqual([])
  })

  it("appends, updates and removes milestones within their goal only", async () => {
    const { goal } = await service.create({ title: "Goal", milestones: [{ title: "First" }] })
    const { goal: other } = await service.create({ title: "Other" })

    const second = await service.addMilestone(goal.id, { title: "Second" })
    expect(second.order).toBe(1)

    const done = await service.updateMilestone(goal.id, second.id, { completedAt: new Date() })
    expect(done.completedAt).toBeInstanceOf(Date)

    await expect(service.updateMilestone(other.id, second.id, { title: "x" })).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.removeMilestone(other.id, second.id)).rejects.toBeInstanceOf(NotFoundError)

    await service.removeMilestone(goal.id, second.id)
    expect((await service.get(goal.id)).milestones.map((m) => m.title)).toEqual(["First"])
  })

  it("throws NotFoundError for missing or deleted goals", async () => {
    const { goal } = await service.create({ title: "Goal" })
    await service.remove(goal.id)

    await expect(service.get(goal.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.update(goal.id, { title: "x" })).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.remove(goal.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.addMilestone(goal.id, { title: "x" })).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.progressHistory(goal.id, {})).rejects.toBeInstanceOf(NotFoundError)
    expect(await service.list()).toEqual([])
  })
})
