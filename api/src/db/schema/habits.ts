import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { deletedAt, id, timestamps } from "../columns"

export const habits = sqliteTable("habits", {
  id: id(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("times"),
  target: integer("target").notNull(),
  ...timestamps(),
  deletedAt: deletedAt(),
})

// One row per habit per local day, holding how many times it was logged.
export const habitLogs = sqliteTable(
  "habit_logs",
  {
    id: id(),
    habitId: text("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    count: integer("count").notNull().default(0),
    ...timestamps(),
  },
  (t) => [unique("habit_logs_habit_day_unique").on(t.habitId, t.day)],
)

export type Habit = typeof habits.$inferSelect
export type HabitLog = typeof habitLogs.$inferSelect
