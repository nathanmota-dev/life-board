import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestApp } from "../test/create-test-app"

let ctx: Awaited<ReturnType<typeof createTestApp>>

beforeEach(async () => {
  ctx = await createTestApp()
})
afterEach(() => ctx.cleanup())

describe("mood controller", () => {
  it("creates then updates the day's entry", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/api/mood/today" })).json().entry).toBeNull()

    const first = await ctx.app.inject({ method: "POST", url: "/api/mood/entries", payload: { score: 3 } })
    const second = await ctx.app.inject({ method: "POST", url: "/api/mood/entries", payload: { score: 5, note: "Great" } })

    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(200)
    expect((await ctx.app.inject({ method: "GET", url: "/api/mood/today" })).json().entry.score).toBe(5)
    expect((await ctx.app.inject({ method: "GET", url: "/api/mood/entries?limit=5" })).json().items).toHaveLength(1)

    const { id } = second.json()
    expect((await ctx.app.inject({ method: "DELETE", url: `/api/mood/entries/${id}` })).json()).toEqual({ ok: true })
  })

  it("validates the score and day", async () => {
    expect((await ctx.app.inject({ method: "POST", url: "/api/mood/entries", payload: { score: 6 } })).statusCode).toBe(400)
    expect(
      (await ctx.app.inject({ method: "POST", url: "/api/mood/entries", payload: { score: 3, day: "17/10/2026" } })).statusCode,
    ).toBe(400)
  })
})
