import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestApp } from "../test/create-test-app"

let ctx: Awaited<ReturnType<typeof createTestApp>>

beforeEach(async () => {
  ctx = await createTestApp()
})
afterEach(() => ctx.cleanup())

describe("calendar controller", () => {
  it("manages events", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/calendar/events",
      payload: { title: "Dentist", startAt: "2026-10-20T14:00:00Z", endAt: "2026-10-20T15:00:00Z" },
    })
    expect(created.statusCode).toBe(201)
    const { id } = created.json()

    const list = await ctx.app.inject({ method: "GET", url: "/api/calendar/events?from=2026-10-01&to=2026-10-31" })
    expect(list.json().items).toHaveLength(1)

    const moved = await ctx.app.inject({ method: "PATCH", url: `/api/calendar/events/${id}`, payload: { location: "Clinic" } })
    expect(moved.json().location).toBe("Clinic")

    expect((await ctx.app.inject({ method: "DELETE", url: `/api/calendar/events/${id}` })).json()).toEqual({ ok: true })
  })

  it("returns 400 when the event ends before it starts", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/calendar/events",
      payload: { title: "Backwards", startAt: "2026-10-20T15:00:00Z", endAt: "2026-10-20T14:00:00Z" },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe("invalid_range")
  })
})
