import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestApp } from "../test/create-test-app"

let ctx: Awaited<ReturnType<typeof createTestApp>>

beforeEach(async () => {
  ctx = await createTestApp()
})
afterEach(() => ctx.cleanup())

describe("health controller", () => {
  it("reports the service as up", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/health" })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ ok: true, service: "life-board-api" })
  })

  it("allows the renderer origins through CORS", async () => {
    const dev = await ctx.app.inject({ method: "GET", url: "/api/health", headers: { origin: "http://127.0.0.1:5180" } })
    const other = await ctx.app.inject({ method: "GET", url: "/api/health", headers: { origin: "https://evil.example" } })

    expect(dev.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5180")
    expect(other.headers["access-control-allow-origin"]).toBeUndefined()
  })
})
