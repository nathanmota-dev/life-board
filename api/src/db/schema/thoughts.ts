import { index, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { bool, deletedAt, id, jsonArray, timestamps } from "../columns"

export const thoughts = sqliteTable(
  "thoughts",
  {
    id: id(),
    title: text("title"),
    body: text("body").notNull().default(""),
    tags: jsonArray("tags"),
    pinned: bool("pinned").notNull().default(false),
    linkedTaskIds: jsonArray("linked_task_ids"),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index("thoughts_created_idx").on(t.createdAt)],
)

export type Thought = typeof thoughts.$inferSelect
