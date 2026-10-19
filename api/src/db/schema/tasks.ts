import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { bool, deletedAt, id, jsonArray, timestamp, timestamps } from "../columns"

export const TASK_STATUSES = ["inbox", "today", "upcoming", "someday", "done"] as const
export const TASK_PRIORITIES = ["none", "low", "medium", "high"] as const
export const TASK_COLORS = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "gray"] as const

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
    pinned: bool("pinned").notNull().default(false),
    color: text("color", { enum: TASK_COLORS }),
    order: integer("order").notNull().default(0),
    archivedAt: timestamp("archived_at"),
    // The local day (YYYY-MM-DD) the task was picked as one of that day's focus tasks.
    focusDay: text("focus_day"),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("tasks_status_idx").on(t.status),
    index("tasks_completed_idx").on(t.completedAt),
    index("tasks_parent_idx").on(t.parentTaskId),
    index("tasks_focus_day_idx").on(t.focusDay),
  ],
)

export type Task = typeof tasks.$inferSelect
