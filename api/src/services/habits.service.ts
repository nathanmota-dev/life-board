import { and, asc, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm"
import { ulid } from "ulid"
import type { Db } from "../db/client"
import { habitLogs, habits, type Habit } from "../db/schema"
import type { CreateHabitBody, ListHabitLogsQuery, LogHabitBody, SetHabitLogBody, UpdateHabitBody } from "../dto/habits.dto"
import { addDays, toDayKey } from "./date.service"
import { BadRequestError, NotFoundError } from "./errors"

export type HabitSummary = Habit & { todayCount: number; doneToday: boolean; streak: number }

/** Consecutive days the goal was met. An unfinished today doesn't break the streak. */
export function getStreak(doneDays: Set<string>, today = new Date()) {
  let offset = doneDays.has(toDayKey(today)) ? 0 : 1
  let streak = 0
  while (doneDays.has(toDayKey(addDays(today, -offset)))) {
    streak++
    offset++
  }
  return streak
}

export class HabitsService {
  constructor(private readonly db: Db) {}

  async list(today = new Date()): Promise<HabitSummary[]> {
    const rows = await this.db.select().from(habits).where(isNull(habits.deletedAt)).orderBy(asc(habits.createdAt))
    if (rows.length === 0) return []

    const logs = await this.db
      .select({ habitId: habitLogs.habitId, day: habitLogs.day, count: habitLogs.count, target: habitLogs.target })
      .from(habitLogs)
      .where(inArray(habitLogs.habitId, rows.map((habit) => habit.id)))

    const todayKey = toDayKey(today)
    return rows.map((habit) => {
      const own = logs.filter((log) => log.habitId === habit.id)
      const doneDays = new Set(own.filter((log) => log.count >= (log.day === todayKey ? habit.target : log.target ?? habit.target)).map((log) => log.day))
      const todayCount = own.find((log) => log.day === todayKey)?.count ?? 0
      return {
        ...habit,
        todayCount,
        doneToday: todayCount >= habit.target,
        streak: getStreak(doneDays, today),
      }
    })
  }

  async create(input: CreateHabitBody): Promise<Habit> {
    const [row] = await this.db.insert(habits).values({ id: ulid(), ...input }).returning()
    return row
  }

  async update(id: string, input: UpdateHabitBody): Promise<Habit> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.update(habits)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(habits.id, id), isNull(habits.deletedAt))).returning()
      if (!row) throw new NotFoundError("Habit not found.")
      if (input.target !== undefined) {
        await tx.update(habitLogs).set({ target: input.target })
          .where(and(eq(habitLogs.habitId, id), eq(habitLogs.day, toDayKey())))
      }
      return row
    })
  }

  async remove(id: string) {
    const [row] = await this.db
      .update(habits)
      .set({ deletedAt: new Date() })
      .where(and(eq(habits.id, id), isNull(habits.deletedAt)))
      .returning({ id: habits.id })
    if (!row) throw new NotFoundError("Habit not found.")
  }

  /** Adds `delta` to the day's count (never going below zero) and returns the new count. */
  async log(habitId: string, { delta, day = toDayKey() }: LogHabitBody) {
    return this.upsertLog(habitId, day, Math.max(0, delta), sql`max(0, ${habitLogs.count} + ${delta})`)
  }

  /** Replaces the day's count, so a forgotten or wrong check-in on a past day can be fixed. */
  async setLog(habitId: string, day: string, { count }: SetHabitLogBody) {
    return this.upsertLog(habitId, day, count, count)
  }

  private async upsertLog(habitId: string, day: string, initial: number, count: number | SQL) {
    const [habit] = await this.db
      .select({ id: habits.id, target: habits.target })
      .from(habits)
      .where(and(eq(habits.id, habitId), isNull(habits.deletedAt)))
    if (!habit) throw new NotFoundError("Habit not found.")
    const today = toDayKey()
    if (day > today) throw new BadRequestError("future_day", "Habits can't be logged for a future day.")

    const [row] = await this.db
      .insert(habitLogs)
      .values({ id: ulid(), habitId, day, count: initial, target: habit.target })
      .onConflictDoUpdate({
        target: [habitLogs.habitId, habitLogs.day],
        set: {
          count,
          // Past days keep the goal recorded at the time; only today follows the current goal.
          target: day === today ? habit.target : sql`coalesce(${habitLogs.target}, ${habit.target})`,
          updatedAt: new Date(),
        },
      })
      .returning({ habitId: habitLogs.habitId, day: habitLogs.day, count: habitLogs.count })
    return row
  }

  logs({ from, to, habitId }: ListHabitLogsQuery) {
    const conditions: SQL[] = []
    // Day keys are zero-padded, so string comparison is chronological.
    if (from) conditions.push(gte(habitLogs.day, from))
    if (to) conditions.push(lte(habitLogs.day, to))
    if (habitId) conditions.push(eq(habitLogs.habitId, habitId))
    return this.db
      .select({ habitId: habitLogs.habitId, day: habitLogs.day, count: habitLogs.count, target: habitLogs.target })
      .from(habitLogs)
      .where(and(...conditions))
      .orderBy(asc(habitLogs.day))
  }
}
