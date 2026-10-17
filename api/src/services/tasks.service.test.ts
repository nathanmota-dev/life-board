import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestDb } from "../test/create-test-app"
import { NotFoundError } from "./errors"
import { TasksService } from "./tasks.service"

let ctx: Awaited<ReturnType<typeof createTestDb>>
let service: TasksService

beforeEach(async () => {
  ctx = await createTestDb()
  service = new TasksService(ctx.db)
})
afterEach(() => ctx.cleanup())

const list = (query: Partial<Parameters<TasksService["list"]>[0]> = {}) => service.list({ limit: 50, ...query })

describe("TasksService", () => {
  it("creates tasks with defaults and stamps completedAt when created as done", async () => {
    const open = await service.create({ title: "Open" })
    const done = await service.create({ title: "Done", status: "done" })

    expect(open).toMatchObject({ status: "inbox", priority: "none", tags: [], completedAt: null })
    expect(done.completedAt).toBeInstanceOf(Date)
  })

  it("orders open tasks by priority and due date, done tasks last", async () => {
    await service.create({ title: "done", status: "done", priority: "high" })
    await service.create({ title: "low", priority: "low" })
    await service.create({ title: "high, no due", priority: "high" })
    await service.create({ title: "high, due", priority: "high", dueAt: new Date(2026, 0, 1) })

    expect((await list()).map((task) => task.title)).toEqual(["high, due", "high, no due", "low", "done"])
  })

  it("filters by status, tag, parent and search", async () => {
    const parent = await service.create({ title: "Parent" })
    await service.create({ title: "Buy milk", tags: ["errands"], status: "today", parentTaskId: parent.id })
    await service.create({ title: "Call mom", description: "about 100% of the plan" })

    expect((await list({ status: "today" })).map((t) => t.title)).toEqual(["Buy milk"])
    expect((await list({ tag: "errands" })).map((t) => t.title)).toEqual(["Buy milk"])
    expect((await list({ parentTaskId: parent.id })).map((t) => t.title)).toEqual(["Buy milk"])
    expect((await list({ search: "MILK" })).map((t) => t.title)).toEqual(["Buy milk"])
    // LIKE wildcards in the search term are matched literally.
    expect((await list({ search: "100%" })).map((t) => t.title)).toEqual(["Call mom"])
    expect(await list({ search: "%" })).toHaveLength(1)
    expect(await list({ limit: 1 })).toHaveLength(1)
  })

  it("sets completedAt when moving into done and clears it when leaving", async () => {
    const task = await service.create({ title: "Task" })

    const done = await service.update(task.id, { status: "done" })
    expect(done.completedAt).toBeInstanceOf(Date)

    const custom = new Date(2026, 5, 1)
    expect((await service.update(task.id, { status: "done", completedAt: custom })).completedAt).toEqual(custom)

    expect((await service.update(task.id, { status: "today" })).completedAt).toBeNull()
    expect((await service.update(task.id, { title: "Renamed" })).title).toBe("Renamed")
  })

  it("soft deletes and then treats the task as missing", async () => {
    const task = await service.create({ title: "Task" })
    expect(await service.get(task.id)).toMatchObject({ id: task.id })

    await service.remove(task.id)

    expect(await list()).toHaveLength(0)
    await expect(service.get(task.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.update(task.id, { title: "x" })).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.remove(task.id)).rejects.toBeInstanceOf(NotFoundError)
  })
})
