import { afterEach, describe, expect, it, vi } from "vitest"
import { createTestApp } from "../test/create-test-app"

let cleanup: (() => Promise<void>) | undefined

afterEach(() => cleanup?.())

describe("auth plugin", () => {
  it("lets every request through while there is no auth", async () => {
    const ctx = await createTestApp()
    cleanup = ctx.cleanup

    expect((await ctx.app.inject({ method: "GET", url: "/api/tasks" })).statusCode).toBe(200)
  })

  it("guards every domain route but leaves health public", async () => {
    const authenticate = vi.fn(async (_request, reply) => {
      await reply.code(401).send({ error: "unauthorized" })
    })
    const ctx = await createTestApp({ authenticate })
    cleanup = ctx.cleanup

    for (const url of ["/api/tasks", "/api/thoughts", "/api/goals", "/api/habits", "/api/mood/today", "/api/github/status", "/api/file-boards", "/api/stats/this-week", "/api/calendar/events"]) {
      expect((await ctx.app.inject({ method: "GET", url })).statusCode, url).toBe(401)
    }
    expect((await ctx.app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200)
    expect(authenticate).toHaveBeenCalledTimes(9)
  })
})
