import { index, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { deletedAt, id, jsonArray, timestamp, timestamps } from "../columns"

export const TASK_STATUSES = ["inbox", "today", "upcoming", "someday", "done"] as const
export const TASK_PRIORITIES = ["none", "low", "medium", "high"] as const

export const tasks = sqliteTable(
  "tasks",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("inbox"),
    priority: text("priority", { enum: TASK_PRIORITIES }).notNull().default("none"),
    dueAt: timestamp("due_at"),
    completedAt: timestamp("completed_at"),
    parentTaskId: text("parent_task_id"),
    tags: jsonArray("tags"),
    linkedThoughtIds: jsonArray("linked_thought_ids"),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index("tasks_status_idx").on(t.status), index("tasks_completed_idx").on(t.completedAt)],
)

export type Task = typeof tasks.$inferSelect
