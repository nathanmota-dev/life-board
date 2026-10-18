import { and, asc, eq, isNull, max } from "drizzle-orm"
import { ulid } from "ulid"
import type { Db } from "../db/client"
import { projects, type Project } from "../db/schema"
import type { CreateProjectBody, ReorderProjectsBody, UpdateProjectBody } from "../dto/projects.dto"
import { BadRequestError, NotFoundError } from "./errors"

export class ProjectsService {
  constructor(private readonly db: Db) {}

  async list() {
    const items = await this.db
      .select()
      .from(projects)
      .where(isNull(projects.deletedAt))
      .orderBy(asc(projects.order), asc(projects.createdAt), asc(projects.id))
    return { items }
  }

  /** New projects go to the end of the board. */
  async create(input: CreateProjectBody): Promise<Project> {
    const [{ last }] = await this.db
      .select({ last: max(projects.order) })
      .from(projects)
      .where(isNull(projects.deletedAt))
    const [row] = await this.db
      .insert(projects)
      .values({ id: ulid(), order: (last ?? -1) + 1, ...input })
      .returning()
    return row
  }

  async get(id: string): Promise<Project> {
    const [row] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    if (!row) throw new NotFoundError("Project not found.")
    return row
  }

  async update(id: string, input: UpdateProjectBody): Promise<Project> {
    const [row] = await this.db
      .update(projects)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
      .returning()
    if (!row) throw new NotFoundError("Project not found.")
    return row
  }

  /** Rewrites every project's `order` from `ids`, which must list each active project exactly once. */
  async reorder({ ids }: ReorderProjectsBody) {
    await this.db.transaction(async (tx) => {
      const active = await tx.select({ id: projects.id }).from(projects).where(isNull(projects.deletedAt))
      const known = new Set(active.map((row) => row.id))
      const unique = new Set(ids)
      if (unique.size !== ids.length || unique.size !== known.size || ids.some((id) => !known.has(id))) {
        throw new BadRequestError("invalid_order", "The order must list every project exactly once.")
      }
      for (const [order, id] of ids.entries()) {
        await tx.update(projects).set({ order }).where(eq(projects.id, id))
      }
    })
    return this.list()
  }

  async remove(id: string) {
    const [row] = await this.db
      .update(projects)
      .set({ deletedAt: new Date() })
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
      .returning({ id: projects.id })
    if (!row) throw new NotFoundError("Project not found.")
  }
}
