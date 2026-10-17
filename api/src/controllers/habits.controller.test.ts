import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestApp } from "../test/create-test-app"

let ctx: Awaited<ReturnType<typeof createTestApp>>

beforeEach(async () => {
  ctx = await createTestApp()
})
afterEach(() => ctx.cleanup())

describe("habits controller", () => {
  it("creates a habit and logs progress toward today's goal", async () => {
    const created = await ctx.app.inject({ method: "POST", url: "/api/habits", payload: { name: "Water", target: 2, unit: "glasses" } })
    expect(created.statusCode).toBe(201)
    const { id } = created.json()

    await ctx.app.inject({ method: "POST", url: `/api/habits/${id}/logs`, payload: { delta: 1 } })
    const logged = await ctx.app.inject({ method: "POST", url: `/api/habits/${id}/logs`, payload: { delta: 1 } })
    expect(logged.json()).toMatchObject({ habitId: id, count: 2 })

    const list = await ctx.app.inject({ method: "GET", url: "/api/habits" })
    expect(list.json().items).toEqual([expect.objectContaining({ id, todayCount: 2, doneToday: true, streak: 1 })])

    const logs = await ctx.app.inject({ method: "GET", url: `/api/habits/logs?habitId=${id}` })
    expect(logs.json().items).toHaveLength(1)

    expect((await ctx.app.inject({ method: "PATCH", url: `/api/habits/${id}`, payload: { target: 8 } })).json().target).toBe(8)
    expect((await ctx.app.inject({ method: "DELETE", url: `/api/habits/${id}` })).json()).toEqual({ ok: true })
    expect((await ctx.app.inject({ method: "POST", url: `/api/habits/${id}/logs`, payload: { delta: 1 } })).statusCode).toBe(404)
  })

  it("validates habits and log deltas", async () => {
    expect((await ctx.app.inject({ method: "POST", url: "/api/habits", payload: { name: " ", target: 1 } })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "POST", url: "/api/habits", payload: { name: "Gym", target: 0 } })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "POST", url: "/api/habits/x/logs", payload: { delta: 0 } })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "GET", url: "/api/habits/logs?from=yesterday" })).statusCode).toBe(400)
  })
})
