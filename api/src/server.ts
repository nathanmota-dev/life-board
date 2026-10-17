import { mkdir } from "node:fs/promises"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { buildApp, type AppOptions } from "./app"
import { createDb } from "./db/client"

export type ServerOptions = {
  /** Where the SQLite database, uploads and the encryption key are stored. */
  dataDir: string
  migrationsFolder: string
  host?: string
  /** 0 picks a free port. */
  port?: number
  logger?: AppOptions["logger"]
}

export async function startServer({ dataDir, migrationsFolder, host = "127.0.0.1", port = 0, logger = true }: ServerOptions) {
  await mkdir(dataDir, { recursive: true })
  const database = await createDb(`file:${join(dataDir, "life-board.db")}`, migrationsFolder)
  const app = await buildApp({ db: database.db, dataDir, logger })
  app.addHook("onClose", async () => database.close())

  await app.listen({ host, port })
  const { port: boundPort } = app.server.address() as AddressInfo
  return { app, port: boundPort, url: `http://${host}:${boundPort}` }
}
