import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { tasks } from "../db/schema"
import { createTestDb } from "../test/create-test-app"
import { NotFoundError } from "./errors"
import { TasksService, type TaskWithChildren } from "./tasks.service"

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
    await service.create({ title: "Buy milk", tags: ["errands"], status: "today" })
    await service.create({ title: "Milk the cow", parentTaskId: parent.id })
    await service.create({ title: "Call mom", description: "about 100% of the plan" })

    expect((await list({ status: "today" })).map((t) => t.title)).toEqual(["Buy milk"])
    expect((await list({ tag: "errands" })).map((t) => t.title)).toEqual(["Buy milk"])
    expect((await list({ parentTaskId: parent.id })).map((t) => t.title)).toEqual(["Milk the cow"])
    // A checklist item's match surfaces its parent, never the item itself.
    expect((await list({ search: "MILK" })).map((t) => t.title).sort()).toEqual(["Buy milk", "Parent"])
    // LIKE wildcards in the search term are matched literally.
    expect((await list({ search: "100%" })).map((t) => t.title)).toEqual(["Call mom"])
    expect(await list({ search: "%" })).toHaveLength(1)
    expect(await list({ limit: 1 })).toHaveLength(1)
  })

  it("never lists checklist items as top-level tasks", async () => {
    const parent = await service.create({ title: "Groceries", status: "today", items: ["Eggs"] })
    await service.update(parent.children[0].id, { status: "done" })

    expect((await list()).map((t) => t.title)).toEqual(["Groceries"])
    expect((await list({ status: "done" })).map((t) => t.title)).toEqual([])
  })

  it("creates checklist items with the task and returns them with include=children", async () => {
    const task = await service.create({ title: "Trip", items: ["Passport", "Tickets"] })
    expect(task.children.map((item) => [item.title, item.parentTaskId, item.order])).toEqual([
      ["Passport", task.id, 0],
      ["Tickets", task.id, 1],
    ])

    const extra = await service.create({ title: "Charger", parentTaskId: task.id, priority: "high" })
    expect(extra.order).toBe(2)
    // Checklist items keep their written order whatever their priority.
    expect((await list({ parentTaskId: task.id })).map((item) => item.title)).toEqual(["Passport", "Tickets", "Charger"])
    await service.remove(task.children[0].id)

    const [listed] = (await list({ include: "children" })) as TaskWithChildren[]
    expect(listed.id).toBe(task.id)
    expect(listed.children.map((item) => item.title)).toEqual(["Tickets", "Charger"])
    expect(await list({ include: "children", search: "nothing" })).toEqual([])
  })

  it("puts new tasks on top of the board and saves reorders", async () => {
    const first = await service.create({ title: "First" })
    const second = await service.create({ title: "Second" })
    const board = async () => ((await list({ include: "children" })) as TaskWithChildren[]).map((t) => [t.title, t.pinned])

    expect(await board()).toEqual([["Second", false], ["First", false]])

    await service.reorder([
      { id: first.id, order: 0, pinned: true },
      { id: second.id, order: 1, pinned: false },
    ])
    expect(await board()).toEqual([["First", true], ["Second", false]])
    expect((await list({ pinned: true })).map((t) => t.title)).toEqual(["First"])
    expect((await list({ pinned: false })).map((t) => t.title)).toEqual(["Second"])
  })

  it("rejects reorders with unknown, duplicate or checklist ids", async () => {
    const task = await service.create({ title: "Task", items: ["Item"] })
    const invalid = [
      [{ id: "missing", order: 0, pinned: false }],
      [{ id: task.id, order: 0, pinned: false }, { id: task.id, order: 1, pinned: false }],
      [{ id: task.children[0].id, order: 0, pinned: false }],
    ]
    for (const items of invalid) {
      await expect(service.reorder(items)).rejects.toMatchObject({ statusCode: 400, code: "invalid_order" })
    }
  })

  it("filters by color and hides archived tasks unless asked for", async () => {
    const red = await service.create({ title: "Red", color: "red", pinned: true })
    await service.create({ title: "Plain" })

    expect((await list({ color: "red" })).map((t) => t.title)).toEqual(["Red"])

    await service.update(red.id, { archivedAt: new Date() })
    expect((await list()).map((t) => t.title)).toEqual(["Plain"])
    expect((await list({ archived: true })).map((t) => t.title)).toEqual(["Red"])

    await service.update(red.id, { archivedAt: null, color: null })
    expect((await list({ archived: false })).map((t) => t.title).sort()).toEqual(["Plain", "Red"])
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

  it("filters by focus day and keeps the day when the task is completed", async () => {
    const focus = await service.create({ title: "Write report", status: "today", focusDay: "2026-10-19" })
    await service.create({ title: "Yesterday", focusDay: "2026-10-18" })
    await service.create({ title: "Plain" })

    expect((await list({ focusDay: "2026-10-19" })).map((t) => t.title)).toEqual(["Write report"])

    const done = await service.update(focus.id, { status: "done" })
    expect(done).toMatchObject({ focusDay: "2026-10-19", completedAt: expect.any(Date) })
    expect((await list({ focusDay: "2026-10-19" })).map((t) => t.status)).toEqual(["done"])

    expect((await service.update(focus.id, { focusDay: null })).focusDay).toBeNull()
    expect(await list({ focusDay: "2026-10-19" })).toEqual([])
  })

  it("refuses a fourth focus task for the same day", async () => {
    const day = "2026-10-19"
    const picked = [await service.create({ title: "One", focusDay: day }), await service.create({ title: "Two", focusDay: day })]
    const third = await service.create({ title: "Three" })
    await service.update(third.id, { focusDay: day, status: "done" })
    const fourth = await service.create({ title: "Four" })

    await expect(service.update(fourth.id, { focusDay: day })).rejects.toMatchObject({ statusCode: 400, code: "focus_limit" })
    await expect(service.create({ title: "Five", focusDay: day })).rejects.toMatchObject({ code: "focus_limit" })
    // Re-saving a task already in the day's focus doesn't count it twice.
    expect((await service.update(picked[0].id, { focusDay: day, title: "One!" })).title).toBe("One!")
    // Other days have their own slots.
    expect((await service.update(fourth.id, { focusDay: "2026-10-20" })).focusDay).toBe("2026-10-20")

    // Archived and deleted focus tasks free their slot.
    await service.update(picked[0].id, { archivedAt: new Date() })
    await service.remove(picked[1].id)
    await service.update(fourth.id, { focusDay: day })
    expect((await service.create({ title: "Five", focusDay: day })).focusDay).toBe(day)
    expect(await list({ focusDay: day })).toHaveLength(3)
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

  it("restores a deleted task with the checklist items deleted alongside it", async () => {
    const task = await service.create({ title: "Trip", items: ["Passport", "Tickets"] })
    // Deleted on its own a while before the task.
    await ctx.db.update(tasks).set({ deletedAt: new Date(2026, 0, 1) }).where(eq(tasks.id, task.children[0].id))
    await service.remove(task.id)
    expect(await list({ parentTaskId: task.id })).toHaveLength(0)

    expect(await service.restore(task.id)).toMatchObject({ id: task.id, deletedAt: null })
    // The item deleted on its own earlier stays deleted.
    expect((await list({ parentTaskId: task.id })).map((t) => t.title)).toEqual(["Tickets"])
    await expect(service.restore(task.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.restore("missing")).rejects.toBeInstanceOf(NotFoundError)
  })
})
