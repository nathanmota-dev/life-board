import { sql } from "drizzle-orm"
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { deletedAt, id, timestamp, timestamps } from "../columns"

export const PROJECT_STATUSES = ["idea", "planned", "in_progress", "paused", "done"] as const

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const projects = sqliteTable(
  "projects",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status", { enum: PROJECT_STATUSES }).notNull().default("idea"),
    // Position inside the project's status column.
    order: integer("order").notNull().default(0),
    // The SQL default only lets the migration add the column; it backfills existing rows and services always set it.
    statusChangedAt: timestamp("status_changed_at").notNull().default(sql`0`),
    pauseReason: text("pause_reason"),
    archivedAt: timestamp("archived_at"),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index("projects_order_idx").on(t.order), index("projects_status_idx").on(t.status, t.order)],
)

/** One row per status a project went through, newest last. */
export const projectStatusChanges = sqliteTable(
  "project_status_changes",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", { enum: PROJECT_STATUSES }).notNull(),
    pauseReason: text("pause_reason"),
    changedAt: timestamp("changed_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("project_status_changes_project_idx").on(t.projectId)],
)

export type Project = typeof projects.$inferSelect
export type ProjectStatusChange = typeof projectStatusChanges.$inferSelect
