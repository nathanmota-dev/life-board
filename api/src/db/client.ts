import { createClient } from "@libsql/client"
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import * as schema from "./schema"

export type Db = LibSQLDatabase<typeof schema>

/**
 * The libsql URL of a database file. libsql percent-decodes the path and treats
 * `?` and `#` as URL syntax, so the whole path is encoded; it then opens exactly
 * the decoded path, including Windows drive letters and backslashes.
 */
export function sqliteFileUrl(path: string) {
  return `file:${encodeURIComponent(path)}`
}

/** `url` is a libsql URL: `sqliteFileUrl(path)`, or `:memory:` for tests. */
export async function createDb(url: string, migrationsFolder: string) {
  const client = createClient({ url })
  await client.execute("PRAGMA foreign_keys = ON")
  // Zero deleted rows on disk, so a disconnected GitHub token doesn't linger in free pages.
  await client.execute("PRAGMA secure_delete = ON")
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  return { db, close: () => client.close() }
}
