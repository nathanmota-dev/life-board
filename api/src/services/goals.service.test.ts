import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestDb } from "../test/create-test-app"
import { NotFoundError } from "./errors"
import { GoalsService } from "./goals.service"

let ctx: Awaited<ReturnType<typeof createTestDb>>
let service: GoalsService

beforeEach(async () => {
  ctx = await createTestDb()
  service = new GoalsService(ctx.db)
})
afterEach(() => ctx.cleanup())

describe("GoalsService", () => {
  it("creates a goal with ordered milestones", async () => {
    const { goal, milestonesCreated } = await service.create({
      title: "Run a marathon",
      milestones: [{ title: "5k" }, { title: "10k", dueAt: new Date(2026, 11, 1) }],
    })

    expect(milestonesCreated).toBe(2)
    const { milestones } = await service.get(goal.id)
    expect(milestones.map((m) => [m.title, m.order])).toEqual([
      ["5k", 0],
      ["10k", 1],
    ])
    expect(await service.list()).toHaveLength(1)
    expect((await service.create({ title: "No milestones" })).milestonesCreated).toBe(0)
  })

  it("stamps completedAt only while completed", async () => {
    const { goal } = await service.create({ title: "Goal" })

    expect((await service.update(goal.id, { status: "completed" })).completedAt).toBeInstanceOf(Date)
    const custom = new Date(2026, 0, 2)
    expect((await service.update(goal.id, { status: "completed", completedAt: custom })).completedAt).toEqual(custom)
    expect((await service.update(goal.id, { status: "paused" })).completedAt).toBeNull()
    expect((await service.update(goal.id, { progress: 40 })).progress).toBe(40)
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
    expect(await service.list()).toEqual([])
  })
})
