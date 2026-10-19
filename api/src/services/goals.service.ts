import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, sql, type SQL } from "drizzle-orm"
import { ulid } from "ulid"
import type { Db } from "../db/client"
import {
  goalMilestones,
  goalProgressSnapshots,
  goals,
  habitLogs,
  habits,
  tasks,
  type Goal,
  type GoalMilestone,
} from "../db/schema"
import type {
  CreateGoalBody,
  CreateMilestoneBody,
  GoalProgressQuery,
  UpdateGoalBody,
  UpdateMilestoneBody,
} from "../dto/goals.dto"
import { addDays, fromDayKey, toDayKey } from "./date.service"
import { NotFoundError } from "./errors"

const DAY_MS = 24 * 60 * 60 * 1000
/** How far below the expected progress an active goal may fall before it's at risk. */
const RISK_MARGIN = 10

export type ProgressPart = { done: number; total: number }
export type GoalBreakdown = { milestones: ProgressPart | null; tasks: ProgressPart | null; habits: ProgressPart | null }
export type GoalRisk = "at_risk" | "overdue" | null
export type MilestoneMarker = { id: string; title: string; dueAt: Date; completedAt: Date | null }
export type GoalSummary = Goal & {
  breakdown: GoalBreakdown
  expectedProgress: number | null
  risk: GoalRisk
  /** Milestones with a due date, for the timeline. */
  milestoneMarkers: MilestoneMarker[]
}

type HabitRow = { id: string; target: number; createdAt: Date }
type LogRow = { habitId: string; day: string; count: number; target: number | null }
type GoalParts = {
  milestones: { id: string; goalId: string; title: string; dueAt: Date | null; completedAt: Date | null }[]
  tasks: { id: string; status: string }[]
  habits: HabitRow[]
  logs: LogRow[]
}

const ratio = (part: ProgressPart) => (part.total ? part.done / part.total : 0)

/** Mean of the parts the goal has; a goal without parts sits at 0%. */
export function autoProgress(breakdown: GoalBreakdown) {
  const parts = [breakdown.milestones, breakdown.tasks, breakdown.habits].filter((part) => part !== null)
  if (parts.length === 0) return 0
  return Math.round((parts.reduce((sum, part) => sum + ratio(part), 0) / parts.length) * 100)
}

/** The day habit tracking counts from: the goal's start (or creation), never before the habit existed. */
function habitStartDay(goal: Goal, habit: HabitRow) {
  const goalStart = toDayKey(goal.startAt ?? goal.createdAt)
  const created = toDayKey(habit.createdAt)
  return goalStart > created ? goalStart : created
}

/** Days the daily goal was met over the days since the start; today only counts once it's met. */
export function habitsPart(goal: Goal, linked: HabitRow[], logs: LogRow[], today = new Date()): ProgressPart {
  const todayKey = toDayKey(today)
  return linked.reduce(
    (part, habit) => {
      const from = habitStartDay(goal, habit)
      if (from > todayKey) return part
      const pastDays = Math.round((fromDayKey(todayKey).getTime() - fromDayKey(from).getTime()) / DAY_MS)
      const met = logs.filter(
        (log) =>
          log.habitId === habit.id &&
          log.day >= from &&
          log.day <= todayKey &&
          log.count >= (log.day === todayKey ? habit.target : log.target ?? habit.target),
      )
      const metToday = met.some((log) => log.day === todayKey)
      return { done: part.done + met.length, total: part.total + pastDays + (metToday ? 1 : 0) }
    },
    { done: 0, total: 0 },
  )
}

export function goalBreakdown(goal: Goal, parts: GoalParts, today = new Date()): GoalBreakdown {
  const milestones = parts.milestones.filter((milestone) => milestone.goalId === goal.id)
  const linkedTasks = parts.tasks.filter((task) => goal.linkedTaskIds.includes(task.id))
  const linkedHabits = parts.habits.filter((habit) => goal.linkedHabitIds.includes(habit.id))
  return {
    milestones: milestones.length
      ? { done: milestones.filter((milestone) => milestone.completedAt).length, total: milestones.length }
      : null,
    tasks: linkedTasks.length
      ? { done: linkedTasks.filter((task) => task.status === "done").length, total: linkedTasks.length }
      : null,
    habits: linkedHabits.length ? habitsPart(goal, linkedHabits, parts.logs, today) : null,
  }
}

/** Expected progress is the elapsed share of the time between start (or creation) and target. */
export function goalRisk(goal: Goal, progress: number, now = new Date()) {
  if (!goal.targetAt) return { expectedProgress: null, risk: null }
  const start = (goal.startAt ?? goal.createdAt).getTime()
  const span = goal.targetAt.getTime() - start
  const elapsed = span > 0 ? (now.getTime() - start) / span : 1
  const expectedProgress = Math.round(Math.min(1, Math.max(0, elapsed)) * 100)
  let risk: GoalRisk = null
  if (goal.status === "active" && progress < 100) {
    if (now.getTime() > goal.targetAt.getTime()) risk = "overdue"
    else if (progress < expectedProgress - RISK_MARGIN) risk = "at_risk"
  }
  return { expectedProgress, risk }
}

export class GoalsService {
  constructor(private readonly db: Db) {}

  async list(now = new Date()): Promise<GoalSummary[]> {
    const rows = await this.db.select().from(goals).where(isNull(goals.deletedAt)).orderBy(desc(goals.createdAt))
    return this.summarize(rows, now)
  }

  async create({ milestones = [], ...input }: CreateGoalBody) {
    const goalId = ulid()
    const goal = await this.db.transaction(async (tx) => {
      const [row] = await tx.insert(goals).values({ id: goalId, ...input }).returning()
      if (milestones.length > 0) {
        await tx.insert(goalMilestones).values(
          milestones.map((milestone, order) => ({ id: ulid(), goalId, order, ...milestone })),
        )
      }
      return row
    })
    const [summary] = await this.summarize([goal])
    return { goal: summary, milestonesCreated: milestones.length }
  }

  async get(id: string, now = new Date()): Promise<{ goal: GoalSummary; milestones: GoalMilestone[] }> {
    const goal = await this.findGoal(id)
    const [summary] = await this.summarize([goal], now)
    return { goal: summary, milestones: await this.milestonesOf(id) }
  }

  async update(id: string, input: UpdateGoalBody): Promise<GoalSummary> {
    // Completing a goal stamps completedAt; any other status clears it.
    const patch: UpdateGoalBody = { ...input }
    if (input.status === "completed" && input.completedAt === undefined) patch.completedAt = new Date()
    else if (input.status && input.status !== "completed") patch.completedAt = null

    const [row] = await this.db
      .update(goals)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(goals.id, id), isNull(goals.deletedAt)))
      .returning()
    if (!row) throw new NotFoundError("Goal not found.")
    const [summary] = await this.summarize([row])
    return summary
  }

  async remove(id: string) {
    const [row] = await this.db
      .update(goals)
      .set({ deletedAt: new Date() })
      .where(and(eq(goals.id, id), isNull(goals.deletedAt)))
      .returning({ id: goals.id })
    if (!row) throw new NotFoundError("Goal not found.")
    // Goals are soft-deleted, so the cascade never fires; drop the history here.
    await this.db.delete(goalProgressSnapshots).where(eq(goalProgressSnapshots.goalId, id))
  }

  async progressHistory(id: string, { from, to }: GoalProgressQuery) {
    await this.findGoal(id)
    const conditions: SQL[] = [eq(goalProgressSnapshots.goalId, id)]
    // Day keys are zero-padded, so string comparison is chronological.
    if (from) conditions.push(gte(goalProgressSnapshots.day, from))
    if (to) conditions.push(lte(goalProgressSnapshots.day, to))
    const items = await this.db
      .select({ day: goalProgressSnapshots.day, progress: goalProgressSnapshots.progress })
      .from(goalProgressSnapshots)
      .where(and(...conditions))
      .orderBy(asc(goalProgressSnapshots.day))
    // The value carried into the range, for charts that start before the first snapshot in it.
    const [previous] = from
      ? await this.db
          .select({ progress: goalProgressSnapshots.progress })
          .from(goalProgressSnapshots)
          .where(and(eq(goalProgressSnapshots.goalId, id), lt(goalProgressSnapshots.day, from)))
          .orderBy(desc(goalProgressSnapshots.day))
          .limit(1)
      : []
    return { items, startingProgress: previous?.progress ?? null }
  }

  async addMilestone(goalId: string, input: CreateMilestoneBody): Promise<GoalMilestone> {
    const goal = await this.findGoal(goalId)
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(goalMilestones)
      .where(and(eq(goalMilestones.goalId, goalId), isNull(goalMilestones.deletedAt)))
    const [row] = await this.db
      .insert(goalMilestones)
      .values({ id: ulid(), goalId, order: total, ...input })
      .returning()
    await this.summarize([goal])
    return row
  }

  async updateMilestone(goalId: string, milestoneId: string, input: UpdateMilestoneBody) {
    const [row] = await this.db
      .update(goalMilestones)
      .set({ ...input, updatedAt: new Date() })
      .where(this.milestoneWhere(goalId, milestoneId))
      .returning()
    if (!row) throw new NotFoundError("Milestone not found.")
    await this.summarize([await this.findGoal(goalId)])
    return row
  }

  async removeMilestone(goalId: string, milestoneId: string) {
    const [row] = await this.db
      .update(goalMilestones)
      .set({ deletedAt: new Date() })
      .where(this.milestoneWhere(goalId, milestoneId))
      .returning({ id: goalMilestones.id })
    if (!row) throw new NotFoundError("Milestone not found.")
    await this.summarize([await this.findGoal(goalId)])
  }

  /** Adds the derived progress, breakdown and risk, and records today's snapshot when progress moved. */
  private async summarize(rows: Goal[], now = new Date()): Promise<GoalSummary[]> {
    if (rows.length === 0) return []
    const parts = await this.loadParts(rows, now)
    const summaries = rows.map((goal) => {
      const breakdown = goalBreakdown(goal, parts, now)
      const progress = goal.progressMode === "auto" ? autoProgress(breakdown) : goal.progress
      const milestoneMarkers = parts.milestones.flatMap(({ id, goalId, title, dueAt, completedAt }) =>
        goalId === goal.id && dueAt ? [{ id, title, dueAt, completedAt }] : [],
      )
      return { ...goal, progress, breakdown, ...goalRisk(goal, progress, now), milestoneMarkers }
    })
    await this.recordSnapshots(summaries, toDayKey(now))
    return summaries
  }

  private async loadParts(rows: Goal[], now: Date): Promise<GoalParts> {
    const taskIds = [...new Set(rows.flatMap((goal) => goal.linkedTaskIds))]
    const habitIds = [...new Set(rows.flatMap((goal) => goal.linkedHabitIds))]
    const earliest = rows.reduce((day, goal) => {
      const start = toDayKey(goal.startAt ?? goal.createdAt)
      return start < day ? start : day
    }, toDayKey(addDays(now, 1)))

    const [milestones, linkedTasks, linkedHabits, logs] = await Promise.all([
      this.db
        .select({
          id: goalMilestones.id,
          goalId: goalMilestones.goalId,
          title: goalMilestones.title,
          dueAt: goalMilestones.dueAt,
          completedAt: goalMilestones.completedAt,
        })
        .from(goalMilestones)
        .where(and(inArray(goalMilestones.goalId, rows.map((goal) => goal.id)), isNull(goalMilestones.deletedAt)))
        .orderBy(asc(goalMilestones.order)),
      taskIds.length
        ? this.db
            .select({ id: tasks.id, status: tasks.status })
            .from(tasks)
            .where(and(inArray(tasks.id, taskIds), isNull(tasks.deletedAt)))
        : [],
      habitIds.length
        ? this.db
            .select({ id: habits.id, target: habits.target, createdAt: habits.createdAt })
            .from(habits)
            .where(and(inArray(habits.id, habitIds), isNull(habits.deletedAt)))
        : [],
      habitIds.length
        ? this.db
            .select({ habitId: habitLogs.habitId, day: habitLogs.day, count: habitLogs.count, target: habitLogs.target })
            .from(habitLogs)
            .where(and(inArray(habitLogs.habitId, habitIds), gte(habitLogs.day, earliest)))
        : [],
    ])
    return { milestones, tasks: linkedTasks, habits: linkedHabits, logs }
  }

  private async recordSnapshots(summaries: GoalSummary[], day: string) {
    // With max(), SQLite takes the bare `progress` from the row holding the latest day.
    const latest = await this.db
      .select({ goalId: goalProgressSnapshots.goalId, day: sql<string>`max(${goalProgressSnapshots.day})`, progress: goalProgressSnapshots.progress })
      .from(goalProgressSnapshots)
      .where(inArray(goalProgressSnapshots.goalId, summaries.map((goal) => goal.id)))
      .groupBy(goalProgressSnapshots.goalId)
    const changed = summaries.filter(
      (goal) => latest.find((snapshot) => snapshot.goalId === goal.id)?.progress !== goal.progress,
    )
    if (changed.length === 0) return
    await this.db
      .insert(goalProgressSnapshots)
      .values(changed.map((goal) => ({ id: ulid(), goalId: goal.id, day, progress: goal.progress })))
      .onConflictDoUpdate({
        target: [goalProgressSnapshots.goalId, goalProgressSnapshots.day],
        set: { progress: sql`excluded.progress`, updatedAt: new Date() },
      })
  }

  private milestonesOf(goalId: string) {
    return this.db
      .select()
      .from(goalMilestones)
      .where(and(eq(goalMilestones.goalId, goalId), isNull(goalMilestones.deletedAt)))
      .orderBy(asc(goalMilestones.order))
  }

  private async findGoal(id: string) {
    const [goal] = await this.db
      .select()
      .from(goals)
      .where(and(eq(goals.id, id), isNull(goals.deletedAt)))
    if (!goal) throw new NotFoundError("Goal not found.")
    return goal
  }

  private milestoneWhere(goalId: string, milestoneId: string) {
    return and(
      eq(goalMilestones.id, milestoneId),
      eq(goalMilestones.goalId, goalId),
      isNull(goalMilestones.deletedAt),
    )
  }
}
