import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestApp } from "../test/create-test-app"

let ctx: Awaited<ReturnType<typeof createTestApp>>

beforeEach(async () => {
  ctx = await createTestApp()
})
afterEach(() => ctx.cleanup())

describe("goals controller", () => {
  it("manages goals and their milestones", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/goals",
      payload: { title: "Read 12 books", domain: "learning", milestones: [{ title: "First book" }] },
    })
    expect(created.statusCode).toBe(201)
    const { goal } = created.json()

    expect((await ctx.app.inject({ method: "GET", url: "/api/goals" })).json().items).toHaveLength(1)

    const milestone = await ctx.app.inject({ method: "POST", url: `/api/goals/${goal.id}/milestones`, payload: { title: "Second" } })
    expect(milestone.statusCode).toBe(201)
    const milestoneUrl = `/api/goals/${goal.id}/milestones/${milestone.json().id}`

    const done = await ctx.app.inject({ method: "PATCH", url: milestoneUrl, payload: { completedAt: "2026-10-17T10:00:00Z" } })
    expect(done.json().completedAt).toBe("2026-10-17T10:00:00.000Z")
    expect((await ctx.app.inject({ method: "DELETE", url: milestoneUrl })).json()).toEqual({ ok: true })

    const detail = await ctx.app.inject({ method: "GET", url: `/api/goals/${goal.id}` })
    expect(detail.json().milestones).toHaveLength(1)

    const updated = await ctx.app.inject({ method: "PATCH", url: `/api/goals/${goal.id}`, payload: { status: "completed" } })
    expect(updated.json().completedAt).toEqual(expect.any(String))

    expect((await ctx.app.inject({ method: "DELETE", url: `/api/goals/${goal.id}` })).json()).toEqual({ ok: true })
    expect((await ctx.app.inject({ method: "GET", url: `/api/goals/${goal.id}` })).statusCode).toBe(404)
  })

  it("validates input", async () => {
    expect((await ctx.app.inject({ method: "POST", url: "/api/goals", payload: { title: "x", color: "red" } })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "PATCH", url: "/api/goals/x", payload: { progress: 101 } })).statusCode).toBe(400)
  })
})
