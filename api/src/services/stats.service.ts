import { and, count, gte, isNull, lt, sql } from "drizzle-orm"
import type { Db } from "../db/client"
import { calendarEvents, goalMilestones, habitLogs, habits, tasks, thoughts } from "../db/schema"
import { addDays, startOfWeek, toDayKey } from "./date.service"

export class StatsService {
  constructor(private readonly db: Db) {}

  async thisWeek(now = new Date()) {
    const start = startOfWeek(now)
    const end = addDays(start, 7)

    const [[thoughtsRow], [tasksRow], [eventsRow], [milestonesRow], [habitsRow]] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(thoughts)
        .where(and(isNull(thoughts.deletedAt), gte(thoughts.createdAt, start), lt(thoughts.createdAt, end))),
      this.db
        .select({ total: count() })
        .from(tasks)
        .where(and(isNull(tasks.deletedAt), gte(tasks.completedAt, start), lt(tasks.completedAt, end))),
      this.db
        .select({ total: count() })
        .from(calendarEvents)
        .where(and(isNull(calendarEvents.deletedAt), gte(calendarEvents.startAt, start), lt(calendarEvents.startAt, end))),
      this.db
        .select({ total: count() })
        .from(goalMilestones)
        .where(
          and(
            isNull(goalMilestones.deletedAt),
            gte(goalMilestones.completedAt, start),
            lt(goalMilestones.completedAt, end),
          ),
        ),
      // Days in the week where a habit's daily goal was met.
      this.db
        .select({ total: count() })
        .from(habitLogs)
        .innerJoin(habits, sql`${habits.id} = ${habitLogs.habitId}`)
        .where(
          and(
            isNull(habits.deletedAt),
            gte(habitLogs.day, toDayKey(start)),
            lt(habitLogs.day, toDayKey(end)),
            sql`${habitLogs.count} >= coalesce(${habitLogs.target}, ${habits.target})`,
          ),
        ),
    ])

    return {
      weekStart: start.toISOString(),
      thoughtsCreated: thoughtsRow.total,
      tasksCompleted: tasksRow.total,
      eventsCount: eventsRow.total,
      milestonesHit: milestonesRow.total,
      habitGoalsMet: habitsRow.total,
    }
  }
}
