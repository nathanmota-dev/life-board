import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { timestamps } from "../columns"

// Single row (id = "default") for app-wide preferences the backend needs.
export const appSettings = sqliteTable("app_settings", {
  id: text("id").primaryKey(),
  // Folder picked in Settings > Files; null keeps uploads in the data directory.
  uploadsBaseDir: text("uploads_base_dir"),
  ...timestamps(),
})

export type AppSettings = typeof appSettings.$inferSelect
