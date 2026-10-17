import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestApp } from "../test/create-test-app"

let ctx: Awaited<ReturnType<typeof createTestApp>>

beforeEach(async () => {
  ctx = await createTestApp()
})
afterEach(() => ctx.cleanup())

describe("thoughts controller", () => {
  it("runs the CRUD flow", async () => {
    const created = await ctx.app.inject({ method: "POST", url: "/api/thoughts", payload: { body: "Idea", tags: ["app"] } })
    expect(created.statusCode).toBe(201)
    const { id } = created.json()

    const list = await ctx.app.inject({ method: "GET", url: "/api/thoughts?pinned=false&tag=app" })
    expect(list.json()).toEqual({ items: [expect.objectContaining({ id })], nextCursor: null })

    expect((await ctx.app.inject({ method: "GET", url: `/api/thoughts/${id}` })).json().body).toBe("Idea")
    expect((await ctx.app.inject({ method: "PATCH", url: `/api/thoughts/${id}`, payload: { pinned: true } })).json().pinned).toBe(true)
    expect((await ctx.app.inject({ method: "DELETE", url: `/api/thoughts/${id}` })).json()).toEqual({ ok: true })
    expect((await ctx.app.inject({ method: "DELETE", url: `/api/thoughts/${id}` })).statusCode).toBe(404)
  })

  it("rejects malformed cursors and booleans", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/api/thoughts?cursor=abc" })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "GET", url: "/api/thoughts?pinned=maybe" })).statusCode).toBe(400)
  })
})
