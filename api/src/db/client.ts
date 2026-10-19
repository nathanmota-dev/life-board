import { createClient } from "@libsql/client"
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import * as schema from "./schema"

export type Db = LibSQLDatabase<typeof schema>

/** `url` is a libsql URL: `file:/path/to/life-board.db`, or `:memory:` for tests. */
export async function createDb(url: string, migrationsFolder: string) {
  const client = createClient({ url })
  await client.execute("PRAGMA foreign_keys = ON")
  // Zero deleted rows on disk, so a disconnected GitHub token doesn't linger in free pages.
  await client.execute("PRAGMA secure_delete = ON")
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  return { db, close: () => client.close() }
}
