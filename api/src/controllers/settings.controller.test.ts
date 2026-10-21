import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestApp } from "../test/create-test-app"

let ctx: Awaited<ReturnType<typeof createTestApp>>

beforeEach(async () => {
  ctx = await createTestApp()
})
afterEach(() => ctx.cleanup())

describe("settings controller", () => {
  it("reads and changes the uploads folder", async () => {
    const defaultUploadsDir = join(ctx.dataDir, "uploads")
    const initial = await ctx.app.inject({ method: "GET", url: "/api/settings/files" })
    expect(initial.json()).toEqual({ baseDir: null, uploadsDir: defaultUploadsDir, defaultUploadsDir })

    const apps = join(ctx.dataDir, "apps")
    await mkdir(apps)
    const changed = await ctx.app.inject({ method: "PUT", url: "/api/settings/files", payload: { baseDir: apps } })
    expect(changed.json()).toMatchObject({ baseDir: apps, uploadsDir: join(apps, "life-board-app", "uploads") })

    const reset = await ctx.app.inject({ method: "PUT", url: "/api/settings/files", payload: { baseDir: null } })
    expect(reset.json()).toMatchObject({ baseDir: null, uploadsDir: defaultUploadsDir })
  })

  it("rejects invalid folders", async () => {
    const empty = await ctx.app.inject({ method: "PUT", url: "/api/settings/files", payload: { baseDir: " " } })
    expect(empty.json().error).toBe("validation_error")

    const missing = await ctx.app.inject({ method: "PUT", url: "/api/settings/files", payload: { baseDir: join(ctx.dataDir, "nope") } })
    expect(missing.statusCode).toBe(400)
    expect(missing.json().error).toBe("invalid_dir")
  })
})
