import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { id, jsonArray, timestamps } from "../columns"

// One entry per local day ("2026-10-17"); re-submitting the same day updates it.
export const moodEntries = sqliteTable("mood_entries", {
  id: id(),
  day: text("day").notNull().unique(),
  score: integer("score").notNull(),
  note: text("note"),
  linkedTaskIds: jsonArray("linked_task_ids"),
  ...timestamps(),
})

export type MoodEntry = typeof moodEntries.$inferSelect
