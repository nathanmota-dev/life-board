import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestApp } from "../test/create-test-app"

let ctx: Awaited<ReturnType<typeof createTestApp>>

beforeEach(async () => {
  ctx = await createTestApp()
})
afterEach(() => ctx.cleanup())

describe("stats controller", () => {
  it("returns this week's counters", async () => {
    await ctx.app.inject({ method: "POST", url: "/api/thoughts", payload: { body: "New" } })

    const response = await ctx.app.inject({ method: "GET", url: "/api/stats/this-week" })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ thoughtsCreated: 1, tasksCompleted: 0, habitGoalsMet: 0 })
  })
})
