import { mkdtemp, readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createDb, sqliteFileUrl } from "./db/client"
import { githubSettings } from "./db/schema"
import { startServer } from "./server"
import { migrationsFolder, removeTestDirectory, testTemporaryRoot } from "./test/create-test-app"

describe("startServer", () => {
  it("creates the database, listens on a free port and shuts down cleanly", async () => {
    const dataDir = join(await mkdtemp(join(testTemporaryRoot, "life-board-server-")), "data")
    const server = await startServer({ dataDir, migrationsFolder, secretKey: Buffer.alloc(32, 3), logger: false })

    try {
      expect(server.port).toBeGreaterThan(0)
      const response = await fetch(`${server.url}/api/health`)
      expect(await response.json()).toMatchObject({ ok: true })
      await expect(stat(join(dataDir, "life-board.db"))).resolves.toBeTruthy()
    } finally {
      await server.app.close()
      await removeTestDirectory(dataDir)
    }
  })

  it("keeps the database inside a profile path with spaces, non-ASCII and URL syntax", async () => {
    const root = await mkdtemp(join(testTemporaryRoot, "life-board-server-"))
    const dataDir = join(root, "Usuário Ç #1 %20", "life-board-app")
    const server = await startServer({ dataDir, migrationsFolder, secretKey: Buffer.alloc(32, 3), logger: false })

    try {
      expect(await (await fetch(`${server.url}/api/health`)).json()).toMatchObject({ ok: true })
      expect(await readdir(root)).toEqual(["Usuário Ç #1 %20"])
      expect(await readdir(dataDir)).toContain("life-board.db")
    } finally {
      await server.app.close()
      await removeTestDirectory(root)
    }
  })

  it.each([false, true])("drops only the encrypted secrets when the key was replaced (reset=%s)", async (resetSecrets) => {
    const dataDir = join(await mkdtemp(join(testTemporaryRoot, "life-board-server-")), "data")
    const first = await startServer({ dataDir, migrationsFolder, secretKey: Buffer.alloc(32, 3), logger: false })
    const created = await fetch(`${first.url}/api/tasks`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Kept" }),
    })
    const task = (await created.json()) as { id: string }
    await first.app.close()
    const database = await createDb(sqliteFileUrl(join(dataDir, "life-board.db")), migrationsFolder)
    await database.db.insert(githubSettings).values({ id: "default", tokenCiphertext: "c", tokenIv: "i", tokenTag: "t", login: "octocat" })
    database.close()

    const server = await startServer({ dataDir, migrationsFolder, secretKey: Buffer.alloc(32, 4), resetSecrets, logger: false })
    try {
      const saved = (await (await fetch(`${server.url}/api/tasks/${task.id}`)).json()) as { title: string }
      const github = (await (await fetch(`${server.url}/api/github/status`)).json()) as { connected: boolean }
      expect(saved.title).toBe("Kept")
      expect(github.connected).toBe(!resetSecrets)
    } finally {
      await server.app.close()
      await removeTestDirectory(join(dataDir, ".."))
    }
  })
})
