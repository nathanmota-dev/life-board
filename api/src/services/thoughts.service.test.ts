import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { thoughts } from "../db/schema"
import { createTestDb } from "../test/create-test-app"
import { NotFoundError } from "./errors"
import { ThoughtsService } from "./thoughts.service"

let ctx: Awaited<ReturnType<typeof createTestDb>>
let service: ThoughtsService

beforeEach(async () => {
  ctx = await createTestDb()
  service = new ThoughtsService(ctx.db)
})
afterEach(() => ctx.cleanup())

describe("ThoughtsService", () => {
  it("lists pinned thoughts first, newest first, with cursor pagination", async () => {
    await ctx.db.insert(thoughts).values([
      { id: "a", body: "oldest", createdAt: new Date(1_000) },
      { id: "b", body: "middle", createdAt: new Date(2_000) },
      { id: "c", body: "newest", createdAt: new Date(3_000) },
      { id: "p", body: "pinned", pinned: true, createdAt: new Date(500) },
    ])

    const first = await service.list({ limit: 2 })
    expect(first.items.map((t) => t.id)).toEqual(["p", "c"])
    expect(first.nextCursor).toBe("0:3000:c")

    const second = await service.list({ limit: 2, cursor: first.nextCursor! })
    expect(second.items.map((t) => t.id)).toEqual(["b", "a"])
    expect(second.nextCursor).toBeNull()
  })

  it("filters by pinned, tag and search", async () => {
    await service.create({ title: "Idea", body: "Build a habit tracker", tags: ["app"], pinned: true })
    await service.create({ body: "Groceries" })

    expect((await service.list({ limit: 10, pinned: true })).items).toHaveLength(1)
    expect((await service.list({ limit: 10, pinned: false })).items[0].body).toBe("Groceries")
    expect((await service.list({ limit: 10, tag: "app" })).items[0].title).toBe("Idea")
    expect((await service.list({ limit: 10, search: "habit" })).items[0].title).toBe("Idea")
    expect((await service.list({ limit: 10, search: "idea" })).items).toHaveLength(1)
  })

  it("gets, updates and soft deletes", async () => {
    const thought = await service.create({ body: "Draft" })
    expect(thought).toMatchObject({ title: null, pinned: false, tags: [] })

    expect((await service.update(thought.id, { pinned: true })).pinned).toBe(true)
    expect((await service.get(thought.id)).pinned).toBe(true)

    await service.remove(thought.id)
    await expect(service.get(thought.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.update(thought.id, { body: "x" })).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.remove(thought.id)).rejects.toBeInstanceOf(NotFoundError)
  })
})
