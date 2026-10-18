import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestApp } from "../test/create-test-app"

let ctx: Awaited<ReturnType<typeof createTestApp>>

beforeEach(async () => {
  ctx = await createTestApp()
})
afterEach(() => ctx.cleanup())

describe("projects controller", () => {
  it("runs the CRUD flow", async () => {
    const created = await ctx.app.inject({ method: "POST", url: "/api/projects", payload: { title: "Side project" } })
    expect(created.statusCode).toBe(201)
    const { id } = created.json()

    expect((await ctx.app.inject({ method: "GET", url: "/api/projects" })).json()).toEqual({ items: [expect.objectContaining({ id })] })
    expect((await ctx.app.inject({ method: "GET", url: `/api/projects/${id}` })).json().title).toBe("Side project")
    expect((await ctx.app.inject({ method: "PATCH", url: `/api/projects/${id}`, payload: { status: "done" } })).json().status).toBe("done")
    expect((await ctx.app.inject({ method: "DELETE", url: `/api/projects/${id}` })).json()).toEqual({ ok: true })
    expect((await ctx.app.inject({ method: "DELETE", url: `/api/projects/${id}` })).statusCode).toBe(404)
  })

  it("reorders projects", async () => {
    const a = (await ctx.app.inject({ method: "POST", url: "/api/projects", payload: { title: "A" } })).json()
    const b = (await ctx.app.inject({ method: "POST", url: "/api/projects", payload: { title: "B" } })).json()

    const reordered = await ctx.app.inject({ method: "PUT", url: "/api/projects/order", payload: { ids: [b.id, a.id] } })
    expect(reordered.json().items.map((p: { title: string }) => p.title)).toEqual(["B", "A"])
    expect((await ctx.app.inject({ method: "PUT", url: "/api/projects/order", payload: { ids: [a.id] } })).statusCode).toBe(400)
  })

  it("validates the body", async () => {
    expect((await ctx.app.inject({ method: "POST", url: "/api/projects", payload: {} })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "POST", url: "/api/projects", payload: { title: "X", status: "maybe" } })).statusCode).toBe(400)
  })
})
