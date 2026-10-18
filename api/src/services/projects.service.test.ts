import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { projects } from "../db/schema"
import { createTestDb } from "../test/create-test-app"
import { BadRequestError, NotFoundError } from "./errors"
import { ProjectsService } from "./projects.service"

let ctx: Awaited<ReturnType<typeof createTestDb>>
let service: ProjectsService

beforeEach(async () => {
  ctx = await createTestDb()
  service = new ProjectsService(ctx.db)
})
afterEach(() => ctx.cleanup())

describe("ProjectsService", () => {
  it("appends new projects to the end of the board", async () => {
    const first = await service.create({ title: "Budget app" })
    const second = await service.create({ title: "Blog", description: "Write about side projects", status: "in_progress" })

    expect(first).toMatchObject({ order: 0, status: "idea", description: "" })
    expect(second).toMatchObject({ order: 1, status: "in_progress" })
    expect((await service.list()).items.map((p) => p.title)).toEqual(["Budget app", "Blog"])
  })

  it("lists by order, then creation time", async () => {
    await ctx.db.insert(projects).values([
      { id: "b", title: "B", order: 1, createdAt: new Date(1_000) },
      { id: "c", title: "C", order: 0, createdAt: new Date(2_000) },
      { id: "a", title: "A", order: 0, createdAt: new Date(1_000) },
    ])
    expect((await service.list()).items.map((p) => p.id)).toEqual(["a", "c", "b"])
  })

  it("reorders every active project", async () => {
    const a = await service.create({ title: "A" })
    const b = await service.create({ title: "B" })
    const c = await service.create({ title: "C" })

    const { items } = await service.reorder({ ids: [c.id, a.id, b.id] })
    expect(items.map((p) => [p.title, p.order])).toEqual([["C", 0], ["A", 1], ["B", 2]])
  })

  it("rejects orders that don't list each active project exactly once", async () => {
    const a = await service.create({ title: "A" })
    const b = await service.create({ title: "B" })
    const removed = await service.create({ title: "Removed" })
    await service.remove(removed.id)

    for (const ids of [[a.id], [a.id, a.id], [a.id, "missing"], [a.id, b.id, removed.id]]) {
      await expect(service.reorder({ ids })).rejects.toBeInstanceOf(BadRequestError)
    }
    expect((await service.list()).items.map((p) => p.order)).toEqual([0, 1])
  })

  it("gets, updates and soft deletes", async () => {
    const project = await service.create({ title: "Draft" })

    expect((await service.update(project.id, { status: "paused" })).status).toBe("paused")
    expect((await service.get(project.id)).status).toBe("paused")

    await service.remove(project.id)
    await expect(service.get(project.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.update(project.id, { title: "x" })).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.remove(project.id)).rejects.toBeInstanceOf(NotFoundError)
    expect((await service.list()).items).toEqual([])
  })
})
