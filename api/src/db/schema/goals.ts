import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { deletedAt, id, jsonArray, timestamp, timestamps } from "../columns"

export const GOAL_STATUSES = ["active", "paused", "completed", "abandoned"] as const
export const GOAL_DOMAINS = ["health", "career", "learning", "relationships", "personal"] as const
export const GOAL_PROGRESS_MODES = ["auto", "manual"] as const

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
  // Typed by hand in manual mode; auto mode derives progress from milestones, tasks and habits.
  progress: integer("progress").notNull().default(0),
  progressMode: text("progress_mode", { enum: GOAL_PROGRESS_MODES }).notNull().default("auto"),
  linkedTaskIds: jsonArray("linked_task_ids"),
  linkedThoughtIds: jsonArray("linked_thought_ids"),
  linkedHabitIds: jsonArray("linked_habit_ids").default([]),
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

// One row per goal per local day, holding the progress it had that day.
export const goalProgressSnapshots = sqliteTable(
  "goal_progress_snapshots",
  {
    id: id(),
    goalId: text("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    progress: integer("progress").notNull(),
    ...timestamps(),
  },
  (t) => [unique("goal_progress_snapshots_goal_day_unique").on(t.goalId, t.day)],
)

export type Goal = typeof goals.$inferSelect
export type GoalMilestone = typeof goalMilestones.$inferSelect
export type GoalProgressSnapshot = typeof goalProgressSnapshots.$inferSelect
