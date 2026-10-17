import { integer, text } from "drizzle-orm/sqlite-core"

export const id = () => text("id").primaryKey()

export const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" })

export const bool = (name: string) => integer(name, { mode: "boolean" })

export const jsonArray = (name: string) =>
  text(name, { mode: "json" }).$type<string[]>().notNull().$defaultFn(() => [])

export const timestamps = () => ({
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
})

export const deletedAt = () => timestamp("deleted_at")
