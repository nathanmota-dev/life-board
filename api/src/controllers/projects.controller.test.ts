import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestApp } from "../test/create-test-app"

let ctx: Awaited<ReturnType<typeof createTestApp>>

beforeEach(async () => {
  ctx = await createTestApp()
})
afterEach(() => ctx.cleanup())

const create = async (payload: object) => (await ctx.app.inject({ method: "POST", url: "/api/projects", payload })).json()

describe("projects controller", () => {
  it("runs the CRUD flow", async () => {
    const created = await ctx.app.inject({ method: "POST", url: "/api/projects", payload: { title: "Side project" } })
    expect(created.statusCode).toBe(201)
    const { id } = created.json()

    expect((await ctx.app.inject({ method: "GET", url: "/api/projects" })).json()).toEqual({ items: [expect.objectContaining({ id })] })
    expect((await ctx.app.inject({ method: "GET", url: `/api/projects/${id}` })).json().title).toBe("Side project")
    expect((await ctx.app.inject({ method: "PATCH", url: `/api/projects/${id}`, payload: { status: "done" } })).json().status).toBe("done")
    expect((await ctx.app.inject({ method: "GET", url: `/api/projects/${id}/history` })).json().items.map((h: { status: string }) => h.status)).toEqual(["done", "idea"])
    expect((await ctx.app.inject({ method: "DELETE", url: `/api/projects/${id}` })).json()).toEqual({ ok: true })
    expect((await ctx.app.inject({ method: "DELETE", url: `/api/projects/${id}` })).statusCode).toBe(404)
    expect((await ctx.app.inject({ method: "POST", url: `/api/projects/${id}/restore` })).json().id).toBe(id)
  })

  it("moves projects between columns", async () => {
    const a = await create({ title: "A" })
    const b = await create({ title: "B", status: "paused" })

    const moved = await ctx.app.inject({ method: "PATCH", url: `/api/projects/${a.id}/move`, payload: { status: "paused", order: 1, pauseReason: "Later" } })
    expect(moved.json().items.map((p: { title: string; order: number }) => [p.title, p.order])).toEqual([["B", 0], ["A", 1]])
    expect((await ctx.app.inject({ method: "GET", url: `/api/projects/${a.id}` })).json()).toMatchObject({ status: "paused", pauseReason: "Later" })
    expect((await ctx.app.inject({ method: "PATCH", url: `/api/projects/${b.id}/move`, payload: { status: "paused", order: -1 } })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "PATCH", url: "/api/projects/missing/move", payload: { status: "idea", order: 0 } })).statusCode).toBe(404)
  })

  it("archives, lists archived projects and restores them", async () => {
    const idea = await create({ title: "Idea" })
    const done = await create({ title: "Done", status: "done" })

    expect((await ctx.app.inject({ method: "POST", url: `/api/projects/${idea.id}/archive` })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "POST", url: `/api/projects/${done.id}/archive` })).json().archivedAt).toEqual(expect.any(String))
    expect((await ctx.app.inject({ method: "GET", url: "/api/projects" })).json().items.map((p: { id: string }) => p.id)).toEqual([idea.id])
    expect((await ctx.app.inject({ method: "GET", url: "/api/projects?archived=true" })).json().items.map((p: { id: string }) => p.id)).toEqual([done.id])
    expect((await ctx.app.inject({ method: "POST", url: `/api/projects/${done.id}/restore` })).json()).toMatchObject({ status: "done", archivedAt: null })
    expect((await ctx.app.inject({ method: "POST", url: `/api/projects/${done.id}/restore` })).statusCode).toBe(404)
  })

  it("validates the input", async () => {
    expect((await ctx.app.inject({ method: "POST", url: "/api/projects", payload: {} })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "POST", url: "/api/projects", payload: { title: "X", status: "maybe" } })).statusCode).toBe(400)
    expect((await ctx.app.inject({ method: "GET", url: "/api/projects?archived=maybe" })).statusCode).toBe(400)
  })
})
