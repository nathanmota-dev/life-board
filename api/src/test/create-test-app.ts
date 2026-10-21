import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { buildApp, type AppOptions } from "../app"
import { createDb, sqliteFileUrl } from "../db/client"
import { CryptoService } from "../services/crypto.service"

export const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url))

/**
 * A fresh SQLite file per test. (libsql's `:memory:` databases don't survive
 * transactions, since the client reopens its connection afterwards.) The folder
 * name has spaces, non-ASCII and URL-reserved characters that are valid on every
 * OS, like real profile paths can.
 */
export async function createTestDb() {
  const dir = await mkdtemp(join(tmpdir(), "life board ção #%20-"))
  const { db, close } = await createDb(sqliteFileUrl(join(dir, "test.db")), migrationsFolder)
  return {
    db,
    dir,
    cleanup: async () => {
      close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

export async function createTestApp(options: Partial<Omit<AppOptions, "db" | "dataDir">> = {}) {
  const database = await createTestDb()
  const app = await buildApp({
    db: database.db,
    dataDir: database.dir,
    crypto: new CryptoService(Buffer.alloc(32, 7)),
    ...options,
  })
  return {
    app,
    db: database.db,
    dataDir: database.dir,
    cleanup: async () => {
      await app.close()
      await database.cleanup()
    },
  }
}
