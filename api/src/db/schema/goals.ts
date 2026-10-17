import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { deletedAt, id, jsonArray, timestamp, timestamps } from "../columns"

export const GOAL_STATUSES = ["active", "paused", "completed", "abandoned"] as const
export const GOAL_DOMAINS = ["health", "career", "learning", "relationships", "personal"] as const

export const goals = sqliteTable("goals", {
  id: id(),
  title: text("title").notNull(),
  why: text("why"),
  domain: text("domain", { enum: GOAL_DOMAINS }).notNull().default("personal"),
  status: text("status", { enum: GOAL_STATUSES }).notNull().default("active"),
  startAt: timestamp("start_at"),
  targetAt: timestamp("target_at"),
  completedAt: timestamp("completed_at"),
  color: text("color").notNull().default("#a855f7"),
  progress: integer("progress").notNull().default(0),
  linkedTaskIds: jsonArray("linked_task_ids"),
  linkedThoughtIds: jsonArray("linked_thought_ids"),
  ...timestamps(),
  deletedAt: deletedAt(),
})

export const goalMilestones = sqliteTable(
  "goal_milestones",
  {
    id: id(),
    goalId: text("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueAt: timestamp("due_at"),
    completedAt: timestamp("completed_at"),
    order: integer("order").notNull().default(0),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index("goal_milestones_goal_idx").on(t.goalId)],
)

export type Goal = typeof goals.$inferSelect
export type GoalMilestone = typeof goalMilestones.$inferSelect
