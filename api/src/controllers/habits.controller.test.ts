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

  it("edits the count of a past day", async () => {
    const { id } = (await ctx.app.inject({ method: "POST", url: "/api/habits", payload: { name: "Water", target: 8 } })).json()
    const edited = await ctx.app.inject({ method: "PUT", url: `/api/habits/${id}/logs/2026-10-16`, payload: { count: 8 } })
    expect(edited.json()).toEqual({ habitId: id, day: "2026-10-16", count: 8 })
    expect((await ctx.app.inject({ method: "GET", url: `/api/habits/logs?habitId=${id}` })).json().items).toEqual([
      { habitId: id, day: "2026-10-16", count: 8, target: 8 },
    ])

    expect((await ctx.app.inject({ method: "PUT", url: `/api/habits/${id}/logs/2999-01-01`, payload: { count: 1 } })).json()).toMatchObject({ error: "future_day" })
    expect((await ctx.app.inject({ method: "PUT", url: `/api/habits/${id}/logs/yesterday`, payload: { count: 1 } })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "PUT", url: `/api/habits/${id}/logs/2026-10-16`, payload: { count: -1 } })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "PUT", url: "/api/habits/missing/logs/2026-10-16", payload: { count: 1 } })).statusCode).toBe(404)
  })
})

describe("habit customization validation", () => {
  it("uses backward-compatible defaults and accepts custom amounts", async () => {
    const defaults = await ctx.app.inject({ method: "POST", url: "/api/habits", payload: { name: "Read", target: 1 } })
    expect(defaults.json()).toMatchObject({ step: 1, emoji: "🌱" })
    const custom = await ctx.app.inject({ method: "POST", url: "/api/habits", payload: { name: "Water", target: 3000, step: 500, emoji: "💧", unit: "ml" } })
    expect(custom.statusCode).toBe(201)
    expect(custom.json()).toMatchObject({ step: 500, emoji: "💧", target: 3000 })
  })

  it.each([{ step: 0 }, { step: -1 }, { step: 0.5 }, { step: 10001 }, { emoji: " " }, { emoji: "x".repeat(33) }])("rejects invalid customization %j", async (fields) => {
    expect((await ctx.app.inject({ method: "POST", url: "/api/habits", payload: { name: "Water", target: 3000, ...fields } })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "PATCH", url: "/api/habits/test", payload: fields })).statusCode).toBe(400)
  })
})
