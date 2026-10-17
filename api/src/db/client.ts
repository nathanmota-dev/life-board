import { createClient } from "@libsql/client"
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import * as schema from "./schema"

export type Db = LibSQLDatabase<typeof schema>

/** `url` is a libsql URL: `file:/path/to/life-board.db`, or `:memory:` for tests. */
export async function createDb(url: string, migrationsFolder: string) {
  const client = createClient({ url })
  await client.execute("PRAGMA foreign_keys = ON")
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  return { db, close: () => client.close() }
}
