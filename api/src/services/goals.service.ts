import { and, asc, count, desc, eq, isNull } from "drizzle-orm"
import { ulid } from "ulid"
import type { Db } from "../db/client"
import { goalMilestones, goals, type Goal, type GoalMilestone } from "../db/schema"
import type {
  CreateGoalBody,
  CreateMilestoneBody,
  UpdateGoalBody,
  UpdateMilestoneBody,
} from "../dto/goals.dto"
import { NotFoundError } from "./errors"

export class GoalsService {
  constructor(private readonly db: Db) {}

  list() {
    return this.db.select().from(goals).where(isNull(goals.deletedAt)).orderBy(desc(goals.createdAt))
  }

  async create({ milestones = [], ...input }: CreateGoalBody) {
    const goalId = ulid()
    return this.db.transaction(async (tx) => {
      const [goal] = await tx.insert(goals).values({ id: goalId, ...input }).returning()
      if (milestones.length > 0) {
        await tx.insert(goalMilestones).values(
          milestones.map((milestone, order) => ({ id: ulid(), goalId, order, ...milestone })),
        )
      }
      return { goal, milestonesCreated: milestones.length }
    })
  }

  async get(id: string): Promise<{ goal: Goal; milestones: GoalMilestone[] }> {
    const goal = await this.findGoal(id)
    const milestones = await this.db
      .select()
      .from(goalMilestones)
      .where(and(eq(goalMilestones.goalId, id), isNull(goalMilestones.deletedAt)))
      .orderBy(asc(goalMilestones.order))
    return { goal, milestones }
  }

  async update(id: string, input: UpdateGoalBody): Promise<Goal> {
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
    return row
  }

  async remove(id: string) {
    const [row] = await this.db
      .update(goals)
      .set({ deletedAt: new Date() })
      .where(and(eq(goals.id, id), isNull(goals.deletedAt)))
      .returning({ id: goals.id })
    if (!row) throw new NotFoundError("Goal not found.")
  }

  async addMilestone(goalId: string, input: CreateMilestoneBody): Promise<GoalMilestone> {
    await this.findGoal(goalId)
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(goalMilestones)
      .where(and(eq(goalMilestones.goalId, goalId), isNull(goalMilestones.deletedAt)))
    const [row] = await this.db
      .insert(goalMilestones)
      .values({ id: ulid(), goalId, order: total, ...input })
      .returning()
    return row
  }

  async updateMilestone(goalId: string, milestoneId: string, input: UpdateMilestoneBody) {
    const [row] = await this.db
      .update(goalMilestones)
      .set({ ...input, updatedAt: new Date() })
      .where(this.milestoneWhere(goalId, milestoneId))
      .returning()
    if (!row) throw new NotFoundError("Milestone not found.")
    return row
  }

  async removeMilestone(goalId: string, milestoneId: string) {
    const [row] = await this.db
      .update(goalMilestones)
      .set({ deletedAt: new Date() })
      .where(this.milestoneWhere(goalId, milestoneId))
      .returning({ id: goalMilestones.id })
    if (!row) throw new NotFoundError("Milestone not found.")
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
