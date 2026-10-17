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

  it("returns 404 for unknown tasks", async () => {
    const response = await ctx.app.inject({ method: "PATCH", url: "/api/tasks/missing", payload: { title: "x" } })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: "not_found", message: "Task not found." })
  })
})
