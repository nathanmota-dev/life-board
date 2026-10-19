import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestApp } from "../test/create-test-app"

let ctx: Awaited<ReturnType<typeof createTestApp>>

beforeEach(async () => {
  ctx = await createTestApp()
})
afterEach(() => ctx.cleanup())

describe("tasks controller", () => {
  it("runs the CRUD flow", async () => {
    const created = await ctx.app.inject({ method: "POST", url: "/api/tasks", payload: { title: "Pay bills", dueAt: "2026-10-20" } })
    expect(created.statusCode).toBe(201)
    const { id } = created.json()

    const list = await ctx.app.inject({ method: "GET", url: "/api/tasks?status=inbox&limit=10" })
    expect(list.json().items).toHaveLength(1)

    expect((await ctx.app.inject({ method: "GET", url: `/api/tasks/${id}` })).json().title).toBe("Pay bills")

    const updated = await ctx.app.inject({ method: "PATCH", url: `/api/tasks/${id}`, payload: { status: "done" } })
    expect(updated.json().completedAt).toEqual(expect.any(String))

    expect((await ctx.app.inject({ method: "DELETE", url: `/api/tasks/${id}` })).json()).toEqual({ ok: true })
    expect((await ctx.app.inject({ method: "GET", url: `/api/tasks/${id}` })).statusCode).toBe(404)
  })

  it("validates bodies and queries", async () => {
    const missingTitle = await ctx.app.inject({ method: "POST", url: "/api/tasks", payload: {} })
    expect(missingTitle.statusCode).toBe(400)
    expect(missingTitle.json()).toMatchObject({ error: "validation_error", issues: [expect.objectContaining({ path: "/title" })] })

    expect((await ctx.app.inject({ method: "POST", url: "/api/tasks", payload: { title: "x", status: "nope" } })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "GET", url: "/api/tasks?limit=1000" })).statusCode).toBe(400)
  })

  it("serves the board: checklist items, filters, reorder, archive and restore", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "Trip", pinned: true, color: "blue", items: ["Passport", " "] },
    })
    expect(created.statusCode).toBe(400)

    const trip = (await ctx.app.inject({ method: "POST", url: "/api/tasks", payload: { title: "Trip", pinned: true, color: "blue", items: ["Passport"] } })).json()
    expect(trip).toMatchObject({ pinned: true, color: "blue", children: [expect.objectContaining({ title: "Passport" })] })
    const plain = (await ctx.app.inject({ method: "POST", url: "/api/tasks", payload: { title: "Plain" } })).json()

    const board = await ctx.app.inject({ method: "GET", url: "/api/tasks?include=children&limit=500" })
    expect(board.json().items.map((task: { title: string; children: unknown[] }) => [task.title, task.children.length])).toEqual([
      ["Plain", 0],
      ["Trip", 1],
    ])
    const titles = async (query: string) =>
      (await ctx.app.inject({ method: "GET", url: `/api/tasks?${query}` })).json().items.map((task: { title: string }) => task.title)
    expect(await titles("pinned=true")).toEqual(["Trip"])
    expect(await titles("pinned=false")).toEqual(["Plain"])
    expect(await titles("color=blue")).toEqual(["Trip"])

    const reorder = await ctx.app.inject({
      method: "PATCH",
      url: "/api/tasks/order",
      payload: [
        { id: trip.id, order: 1, pinned: false },
        { id: plain.id, order: 0, pinned: true },
      ],
    })
    expect(reorder.json()).toEqual({ ok: true })
    expect(await titles("pinned=true")).toEqual(["Plain"])

    await ctx.app.inject({ method: "PATCH", url: `/api/tasks/${trip.id}`, payload: { archivedAt: new Date().toISOString() } })
    expect(await titles("archived=true")).toEqual(["Trip"])
    expect(await titles("include=children")).toEqual(["Plain"])

    await ctx.app.inject({ method: "DELETE", url: `/api/tasks/${plain.id}` })
    const restored = await ctx.app.inject({ method: "POST", url: `/api/tasks/${plain.id}/restore` })
    expect(restored.json()).toMatchObject({ id: plain.id, deletedAt: null })
  })

  it("rejects invalid board requests", async () => {
    const statusOf = async (method: "GET" | "PATCH", url: string, payload?: unknown) =>
      (await ctx.app.inject({ method, url, payload: payload as object })).statusCode
    expect(await statusOf("GET", "/api/tasks?pinned=yes")).toBe(400)
    expect(await statusOf("GET", "/api/tasks?color=neon")).toBe(400)
    expect(await statusOf("GET", "/api/tasks?include=everything")).toBe(400)
    expect(await statusOf("PATCH", "/api/tasks/order", [])).toBe(400)
    expect(await statusOf("PATCH", "/api/tasks/order", [{ id: "missing", order: 0, pinned: false }])).toBe(400)
    expect((await ctx.app.inject({ method: "POST", url: "/api/tasks/missing/restore" })).statusCode).toBe(404)
  })

  it("returns 404 for unknown tasks", async () => {
    const response = await ctx.app.inject({ method: "PATCH", url: "/api/tasks/missing", payload: { title: "x" } })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: "not_found", message: "Task not found." })
  })
})
