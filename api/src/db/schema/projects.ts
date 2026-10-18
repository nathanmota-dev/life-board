import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { deletedAt, id, timestamps } from "../columns"

export const PROJECT_STATUSES = ["idea", "planned", "in_progress", "paused", "done"] as const

export const projects = sqliteTable(
  "projects",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status", { enum: PROJECT_STATUSES }).notNull().default("idea"),
    order: integer("order").notNull().default(0),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index("projects_order_idx").on(t.order)],
)

export type Project = typeof projects.$inferSelect
