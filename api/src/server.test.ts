import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { startServer } from "./server"
import { migrationsFolder } from "./test/create-test-app"

describe("startServer", () => {
  it("creates the database, listens on a free port and shuts down cleanly", async () => {
    const dataDir = join(await mkdtemp(join(tmpdir(), "life-board-server-")), "data")
    const server = await startServer({ dataDir, migrationsFolder, logger: false })

    try {
      expect(server.port).toBeGreaterThan(0)
      const response = await fetch(`${server.url}/api/health`)
      expect(await response.json()).toMatchObject({ ok: true })
      await expect(stat(join(dataDir, "life-board.db"))).resolves.toBeTruthy()
    } finally {
      await server.app.close()
      await rm(dataDir, { recursive: true, force: true })
    }
  })
})
