import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { PROJECT_STATUSES, projects } from "../db/schema"
import { createTestDb } from "../test/create-test-app"
import { BadRequestError, NotFoundError } from "./errors"
import { ARCHIVE_AFTER_MS, ProjectsService } from "./projects.service"

let ctx: Awaited<ReturnType<typeof createTestDb>>
let service: ProjectsService

beforeEach(async () => {
  ctx = await createTestDb()
  service = new ProjectsService(ctx.db)
})
afterEach(() => ctx.cleanup())

/** The board as [title, status, order], column by column. */
const board = async () =>
  (await service.list()).items
    .map((p) => [p.title, p.status, p.order] as const)
    .sort((a, b) => PROJECT_STATUSES.indexOf(a[1]) - PROJECT_STATUSES.indexOf(b[1]) || a[2] - b[2])

describe("ProjectsService", () => {
  it("adds new projects to the top of their column", async () => {
    const first = await service.create({ title: "Budget app" })
    const second = await service.create({ title: "Blog", description: "Write about side projects" })
    const started = await service.create({ title: "Garden", status: "in_progress", pauseReason: "ignored" })

    expect(first).toMatchObject({ status: "idea", description: "", pauseReason: null, archivedAt: null })
    expect(second.order).toBe(0)
    expect(started).toMatchObject({ order: 0, status: "in_progress", pauseReason: null })
    expect(await board()).toEqual([
      ["Blog", "idea", 0],
      ["Budget app", "idea", 1],
      ["Garden", "in_progress", 0],
    ])
  })

  it("keeps the pause reason of projects created as paused", async () => {
    expect((await service.create({ title: "Paused", status: "paused", pauseReason: "Waiting" })).pauseReason).toBe("Waiting")
    expect((await service.create({ title: "Blank", status: "paused", pauseReason: "" })).pauseReason).toBeNull()
  })

  it("lists by order, then creation time", async () => {
    await ctx.db.insert(projects).values([
      { id: "b", title: "B", order: 1, createdAt: new Date(1_000) },
      { id: "c", title: "C", order: 0, createdAt: new Date(2_000) },
      { id: "a", title: "A", order: 0, createdAt: new Date(1_000) },
    ])
    expect((await service.list()).items.map((p) => p.id)).toEqual(["a", "c", "b"])
  })

  it("reorders inside a column without gaps", async () => {
    const c = await service.create({ title: "C" })
    await service.create({ title: "B" })
    await service.create({ title: "A" })

    const { items } = await service.move(c.id, { status: "idea", order: 0 })
    expect(items.map((p) => [p.title, p.order])).toEqual([["C", 0], ["A", 1], ["B", 2]])
    expect((await service.history(c.id)).items).toHaveLength(1)
  })

  it("moves across columns, rewriting both of them and recording the change", async () => {
    const b = await service.create({ title: "B" })
    const a = await service.create({ title: "A" })
    await service.create({ title: "Y", status: "paused" })
    await service.create({ title: "X", status: "paused" })
    const before = (await service.get(a.id)).statusChangedAt

    await service.move(a.id, { status: "paused", order: 1, pauseReason: "Waiting on parts" })
    expect(await board()).toEqual([
      ["B", "idea", 0],
      ["X", "paused", 0],
      ["A", "paused", 1],
      ["Y", "paused", 2],
    ])
    const moved = await service.get(a.id)
    expect(moved.pauseReason).toBe("Waiting on parts")
    expect(moved.statusChangedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect((await service.history(a.id)).items.map((h) => [h.status, h.pauseReason])).toEqual([
      ["paused", "Waiting on parts"],
      ["idea", null],
    ])

    await service.move(a.id, { status: "planned", order: 50 })
    expect((await service.get(a.id)).pauseReason).toBeNull()
    await service.move(b.id, { status: "planned", order: 50 })
    expect(await board()).toEqual([
      ["A", "planned", 0],
      ["B", "planned", 1],
      ["X", "paused", 0],
      ["Y", "paused", 1],
    ])
  })

  it("moves a project when its status is edited", async () => {
    const a = await service.create({ title: "A" })
    await service.create({ title: "Existing", status: "paused" })

    const paused = await service.update(a.id, { title: "A2", status: "paused", pauseReason: "Busy" })
    expect(paused).toMatchObject({ title: "A2", status: "paused", order: 0, pauseReason: "Busy" })
    expect((await service.update(a.id, { pauseReason: "Still busy" })).pauseReason).toBe("Still busy")
    expect((await service.update(a.id, { status: "paused", pauseReason: "" })).pauseReason).toBeNull()
    expect((await service.update(a.id, { status: "done", pauseReason: "x" })).pauseReason).toBeNull()
    expect((await service.update(a.id, { pauseReason: "not paused" })).pauseReason).toBeNull()
    expect((await service.history(a.id)).items.map((h) => h.status)).toEqual(["done", "paused", "idea"])
  })

  it("archives Done projects and restores them to the top of Done", async () => {
    const idea = await service.create({ title: "Idea" })
    const done = await service.create({ title: "Done", status: "done" })
    await service.create({ title: "Other", status: "done" })

    await expect(service.archive(idea.id)).rejects.toBeInstanceOf(BadRequestError)
    expect((await service.archive(done.id)).archivedAt).toBeInstanceOf(Date)
    await expect(service.archive(done.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.move(done.id, { status: "idea", order: 0 })).rejects.toBeInstanceOf(NotFoundError)
    expect(await board()).toEqual([
      ["Idea", "idea", 0],
      ["Other", "done", 0],
    ])
    expect((await service.list({ archived: true })).items.map((p) => p.title)).toEqual(["Done"])
    expect((await service.get(done.id)).title).toBe("Done")

    const restored = await service.restore(done.id)
    expect(restored).toMatchObject({ archivedAt: null, status: "done", order: 0 })
    expect(await board()).toEqual([
      ["Idea", "idea", 0],
      ["Done", "done", 0],
      ["Other", "done", 1],
    ])
    expect((await service.list({ archived: true })).items).toEqual([])
    expect((await service.history(done.id)).items.map((h) => h.status)).toEqual(["done", "done"])
    await expect(service.restore(done.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.restore("missing")).rejects.toBeInstanceOf(NotFoundError)
  })

  it("archives projects that have been Done for over 14 days when the board is listed", async () => {
    const now = Date.now()
    await ctx.db.insert(projects).values([
      { id: "old", title: "Old", status: "done", statusChangedAt: new Date(now - ARCHIVE_AFTER_MS - 1_000) },
      { id: "recent", title: "Recent", status: "done", statusChangedAt: new Date(now - ARCHIVE_AFTER_MS + 60_000) },
      { id: "paused", title: "Paused", status: "paused", statusChangedAt: new Date(0) },
    ])

    expect((await service.list()).items.map((p) => p.id).sort()).toEqual(["paused", "recent"])
    expect((await service.list({ archived: true })).items.map((p) => p.id)).toEqual(["old"])
  })

  it("undoes a delete in place", async () => {
    await service.create({ title: "B" })
    const a = await service.create({ title: "A" })

    await service.remove(a.id)
    expect((await service.list()).items.map((p) => p.title)).toEqual(["B"])
    expect(await service.restore(a.id)).toMatchObject({ deletedAt: null, status: "idea" })
    expect(await board()).toEqual([
      ["A", "idea", 0],
      ["B", "idea", 1],
    ])
  })

  it("gets, updates and soft deletes", async () => {
    const project = await service.create({ title: "Draft" })

    expect((await service.update(project.id, { description: "Notes" })).description).toBe("Notes")
    expect((await service.get(project.id)).description).toBe("Notes")

    await service.remove(project.id)
    await expect(service.get(project.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.history(project.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.update(project.id, { title: "x" })).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.remove(project.id)).rejects.toBeInstanceOf(NotFoundError)
    expect((await service.list()).items).toEqual([])
  })

  it("drops archived projects from deletes too", async () => {
    const done = await service.create({ title: "Done", status: "done" })
    await service.archive(done.id)
    await service.remove(done.id)
    expect((await service.list({ archived: true })).items).toEqual([])
    const [row] = await ctx.db.select().from(projects).where(eq(projects.id, done.id))
    expect(row.archivedAt).toBeInstanceOf(Date)
  })
})
