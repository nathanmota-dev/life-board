import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { buildApp, type AppOptions } from "../app"
import { createDb, sqliteFileUrl } from "../db/client"
import { CryptoService } from "../services/crypto.service"

export const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url))
export const testTemporaryRoot = process.env.LIFE_BOARD_API_TEST_ROOT ?? tmpdir()

export async function removeTestDirectory(dir: string) {
  if (process.platform === "win32" && process.env.LIFE_BOARD_API_TEST_ROOT) {
    const path = relative(testTemporaryRoot, dir)
    if (path.startsWith("..") || isAbsolute(path)) throw new Error("Test directory is outside its owned session.")
    // The parent test launcher removes it after Windows releases libSQL's
    // prepared statement handles. Assertions and client.close() still run.
  } else await rm(dir, { recursive: true, force: true })
}

/**
 * A fresh SQLite file per test. (libsql's `:memory:` databases don't survive
 * transactions, since the client reopens its connection afterwards.) The folder
 * name has spaces, non-ASCII and URL-reserved characters that are valid on every
 * OS, like real profile paths can.
 */
export async function createTestDb() {
  const dir = await mkdtemp(join(testTemporaryRoot, "life board ção #%20-"))
  const { db, close } = await createDb(sqliteFileUrl(join(dir, "test.db")), migrationsFolder)
  return {
    db,
    dir,
    cleanup: async () => {
      close()
      await removeTestDirectory(dir)
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
