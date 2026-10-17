import { index, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { bool, deletedAt, id, jsonArray, timestamp, timestamps } from "../columns"

export const calendarEvents = sqliteTable(
  "calendar_events",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description"),
    startAt: timestamp("start_at").notNull(),
    endAt: timestamp("end_at").notNull(),
    allDay: bool("all_day").notNull().default(false),
    location: text("location"),
    color: text("color").notNull().default("#3b82f6"),
    linkedTaskIds: jsonArray("linked_task_ids"),
    linkedThoughtIds: jsonArray("linked_thought_ids"),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index("calendar_events_start_idx").on(t.startAt)],
)

export type CalendarEvent = typeof calendarEvents.$inferSelect
