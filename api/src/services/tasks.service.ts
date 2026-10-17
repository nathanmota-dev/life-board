import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm"
import { ulid } from "ulid"
import type { Db } from "../db/client"
import { tasks, type Task } from "../db/schema"
import type { CreateTaskBody, ListTasksQuery, UpdateTaskBody } from "../dto/tasks.dto"
import { NotFoundError } from "./errors"
import { jsonArrayContains, searchColumns } from "./query.service"

export class TasksService {
  constructor(private readonly db: Db) {}

  list({ status, limit, search, parentTaskId, tag }: ListTasksQuery) {
    const conditions: SQL[] = [isNull(tasks.deletedAt)]
    if (status) conditions.push(eq(tasks.status, status))
    if (search) conditions.push(searchColumns([tasks.title, tasks.description], search))
    if (parentTaskId) conditions.push(eq(tasks.parentTaskId, parentTaskId))
    if (tag) conditions.push(jsonArrayContains(tasks.tags, tag))

    // Open tasks first, then by priority, then by due date (undated last).
    return this.db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(
        sql`case ${tasks.status} when 'done' then 1 else 0 end`,
        sql`case ${tasks.priority} when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end`,
        sql`${tasks.dueAt} nulls last`,
        desc(tasks.createdAt),
      )
      .limit(limit)
  }

  async create(input: CreateTaskBody): Promise<Task> {
    const completedAt = input.status === "done" ? new Date() : null
    const [row] = await this.db
      .insert(tasks)
      .values({ id: ulid(), ...input, completedAt })
      .returning()
    return row
  }

  async get(id: string): Promise<Task> {
    const [row] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
    if (!row) throw new NotFoundError("Task not found.")
    return row
  }

  async update(id: string, input: UpdateTaskBody): Promise<Task> {
    // Moving into "done" stamps completedAt; moving out of it clears it.
    const patch: UpdateTaskBody = { ...input }
    if (input.status === "done" && input.completedAt === undefined) patch.completedAt = new Date()
    else if (input.status && input.status !== "done") patch.completedAt = null

    const [row] = await this.db
      .update(tasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
      .returning()
    if (!row) throw new NotFoundError("Task not found.")
    return row
  }

  async remove(id: string) {
    const [row] = await this.db
      .update(tasks)
      .set({ deletedAt: new Date() })
      .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
      .returning({ id: tasks.id })
    if (!row) throw new NotFoundError("Task not found.")
  }
}
