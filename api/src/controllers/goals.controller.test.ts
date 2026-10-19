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
    expect(detail.json().goal).toMatchObject({ progressMode: "auto", progress: 0, breakdown: { milestones: { done: 0, total: 1 } }, risk: null })

    const updated = await ctx.app.inject({ method: "PATCH", url: `/api/goals/${goal.id}`, payload: { status: "completed" } })
    expect(updated.json().completedAt).toEqual(expect.any(String))

    expect((await ctx.app.inject({ method: "DELETE", url: `/api/goals/${goal.id}` })).json()).toEqual({ ok: true })
    expect((await ctx.app.inject({ method: "GET", url: `/api/goals/${goal.id}` })).statusCode).toBe(404)
  })

  it("returns the progress history of a goal", async () => {
    const { goal } = (await ctx.app.inject({ method: "POST", url: "/api/goals", payload: { title: "Save money", progressMode: "manual" } })).json()
    await ctx.app.inject({ method: "PATCH", url: `/api/goals/${goal.id}`, payload: { progress: 25 } })

    const history = await ctx.app.inject({ method: "GET", url: `/api/goals/${goal.id}/progress?from=2026-01-01` })
    expect(history.statusCode).toBe(200)
    expect(history.json()).toEqual({ items: [{ day: expect.any(String), progress: 25 }], startingProgress: null })
    expect((await ctx.app.inject({ method: "GET", url: `/api/goals/${goal.id}/progress?from=yesterday` })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "GET", url: "/api/goals/missing/progress" })).statusCode).toBe(404)
  })

  it("validates input", async () => {
    expect((await ctx.app.inject({ method: "POST", url: "/api/goals", payload: { title: "x", color: "red" } })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "PATCH", url: "/api/goals/x", payload: { progress: 101 } })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "PATCH", url: "/api/goals/x", payload: { progressMode: "smart" } })).statusCode).toBe(400)
  })
})
