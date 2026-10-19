import { and, asc, desc, eq, exists, inArray, isNotNull, isNull, max, min, or, sql, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/sqlite-core"
import { ulid } from "ulid"
import type { Db } from "../db/client"
import { tasks, type Task } from "../db/schema"
import type { CreateTaskBody, ListTasksQuery, ReorderTasksBody, UpdateTaskBody } from "../dto/tasks.dto"
import { BadRequestError, NotFoundError } from "./errors"
import { jsonArrayContains, searchColumns } from "./query.service"

export type TaskWithChildren = Task & { children: Task[] }

const children = alias(tasks, "children")

export class TasksService {
  constructor(private readonly db: Db) {}

  async list(query: ListTasksQuery): Promise<Task[] | TaskWithChildren[]> {
    const { status, limit, search, parentTaskId, tag, include, pinned, color, archived } = query
    // Subtasks only ever show up under their parent, never as top-level items.
    const conditions: SQL[] = [
      isNull(tasks.deletedAt),
      parentTaskId ? eq(tasks.parentTaskId, parentTaskId) : isNull(tasks.parentTaskId),
      archived ? isNotNull(tasks.archivedAt) : isNull(tasks.archivedAt),
    ]
    if (status) conditions.push(eq(tasks.status, status))
    if (search) conditions.push(this.matchesSearch(search))
    if (tag) conditions.push(jsonArrayContains(tasks.tags, tag))
    if (pinned !== undefined) conditions.push(eq(tasks.pinned, pinned))
    if (color) conditions.push(eq(tasks.color, color))

    if (include === "children") {
      // The board's hand-made order, newest first among cards never moved.
      const rows = await this.db
        .select()
        .from(tasks)
        .where(and(...conditions))
        .orderBy(asc(tasks.order), desc(tasks.createdAt), asc(tasks.id))
        .limit(limit)
      return this.withChildren(rows)
    }

    const ordering = parentTaskId
      ? // A checklist keeps the order its items were written in.
        [asc(tasks.order), asc(tasks.createdAt), asc(tasks.id)]
      : // Open tasks first, then by priority, then by due date (undated last).
        [
          sql`case ${tasks.status} when 'done' then 1 else 0 end`,
          sql`case ${tasks.priority} when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end`,
          sql`${tasks.dueAt} nulls last`,
          desc(tasks.createdAt),
        ]
    return this.db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(...ordering)
      .limit(limit)
  }

  /** New top-level tasks go to the top of the board; new checklist items go to the end of their list. */
  async create({ items = [], ...input }: CreateTaskBody): Promise<TaskWithChildren> {
    const completedAt = input.status === "done" ? new Date() : null
    return this.db.transaction(async (tx) => {
      const [{ first, last }] = await tx
        .select({ first: min(tasks.order), last: max(tasks.order) })
        .from(tasks)
        .where(
          and(
            isNull(tasks.deletedAt),
            input.parentTaskId ? eq(tasks.parentTaskId, input.parentTaskId) : isNull(tasks.parentTaskId),
          ),
        )
      const order = input.parentTaskId ? (last ?? -1) + 1 : (first ?? 1) - 1
      const [row] = await tx
        .insert(tasks)
        .values({ id: ulid(), ...input, order, completedAt })
        .returning()
      const created =
        items.length > 0
          ? await tx
              .insert(tasks)
              .values(items.map((title, index) => ({ id: ulid(), title, parentTaskId: row.id, order: index })))
              .returning()
          : []
      return { ...row, children: created }
    })
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

  /** Saves a drag on the board: every listed top-level task gets its new position and section. */
  async reorder(items: ReorderTasksBody) {
    const ids = items.map((item) => item.id)
    await this.db.transaction(async (tx) => {
      const found = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(inArray(tasks.id, ids), isNull(tasks.deletedAt), isNull(tasks.parentTaskId)))
      if (new Set(ids).size !== ids.length || found.length !== ids.length) {
        throw new BadRequestError("invalid_order", "The order must list existing tasks exactly once.")
      }
      for (const { id, order, pinned } of items) {
        await tx.update(tasks).set({ order, pinned }).where(eq(tasks.id, id))
      }
    })
  }

  /** Deletes the task along with its checklist items, stamped together so `restore` can bring both back. */
  async remove(id: string) {
    const deletedAt = new Date()
    const [row] = await this.db
      .update(tasks)
      .set({ deletedAt })
      .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
      .returning({ id: tasks.id })
    if (!row) throw new NotFoundError("Task not found.")
    await this.db
      .update(tasks)
      .set({ deletedAt })
      .where(and(eq(tasks.parentTaskId, id), isNull(tasks.deletedAt)))
  }

  /** Undoes `remove`: the task comes back with the checklist items deleted alongside it. */
  async restore(id: string): Promise<Task> {
    const [deleted] = await this.db
      .select({ deletedAt: tasks.deletedAt })
      .from(tasks)
      .where(and(eq(tasks.id, id), isNotNull(tasks.deletedAt)))
    if (!deleted?.deletedAt) throw new NotFoundError("Task not found.")
    await this.db
      .update(tasks)
      .set({ deletedAt: null })
      .where(and(or(eq(tasks.id, id), eq(tasks.parentTaskId, id)), eq(tasks.deletedAt, deleted.deletedAt)))
    return this.get(id)
  }

  private async withChildren(rows: Task[]): Promise<TaskWithChildren[]> {
    const items =
      rows.length > 0
        ? await this.db
            .select()
            .from(tasks)
            .where(and(inArray(tasks.parentTaskId, rows.map((row) => row.id)), isNull(tasks.deletedAt)))
            .orderBy(asc(tasks.order), asc(tasks.createdAt), asc(tasks.id))
        : []
    return rows.map((row) => ({ ...row, children: items.filter((item) => item.parentTaskId === row.id) }))
  }

  /** Title or notes match, or one of the task's checklist items does. */
  private matchesSearch(term: string) {
    const childMatch = this.db
      .select({ id: children.id })
      .from(children)
      .where(and(eq(children.parentTaskId, tasks.id), isNull(children.deletedAt), searchColumns([children.title], term)))
    return or(searchColumns([tasks.title, tasks.description], term), exists(childMatch)) as SQL
  }
}
