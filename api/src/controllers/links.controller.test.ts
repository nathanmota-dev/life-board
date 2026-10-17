import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestApp } from "../test/create-test-app"

let ctx: Awaited<ReturnType<typeof createTestApp>>

beforeEach(async () => {
  ctx = await createTestApp()
})
afterEach(() => ctx.cleanup())

describe("links controller", () => {
  it("resolves links and lists backlinks", async () => {
    const thought = (await ctx.app.inject({ method: "POST", url: "/api/thoughts", payload: { title: "Plan" } })).json()
    const task = (
      await ctx.app.inject({ method: "POST", url: "/api/tasks", payload: { title: "Do it", linkedThoughtIds: [thought.id] } })
    ).json()

    const resolved = await ctx.app.inject({ method: "POST", url: "/api/links/resolve", payload: { taskIds: [task.id] } })
    expect(resolved.json().links).toEqual([{ moduleId: "tasks", entity: expect.objectContaining({ id: task.id }) }])

    const backlinks = await ctx.app.inject({ method: "GET", url: `/api/links/backlinks/thought/${thought.id}` })
    expect(backlinks.json().backlinks).toEqual([expect.objectContaining({ source: "tasks", sourceId: task.id })])
  })

  it("rejects unknown backlink kinds", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/api/links/backlinks/money/1" })).statusCode).toBe(400)
  })
})
