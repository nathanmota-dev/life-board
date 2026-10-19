import { and, asc, desc, eq, isNotNull, isNull, lt, or } from "drizzle-orm"
import { ulid } from "ulid"
import type { Db } from "../db/client"
import { projects, projectStatusChanges, type Project, type ProjectStatus } from "../db/schema"
import type { CreateProjectBody, ListProjectsQuery, MoveProjectBody, UpdateProjectBody } from "../dto/projects.dto"
import { BadRequestError, NotFoundError } from "./errors"

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

/** Done projects leave the board this long after reaching Done. */
export const ARCHIVE_AFTER_MS = 14 * 24 * 60 * 60 * 1000

const onBoard = and(isNull(projects.deletedAt), isNull(projects.archivedAt))

export class ProjectsService {
  constructor(private readonly db: Db) {}

  /** The board (archiving stale Done projects first), or the archived projects, newest first. */
  async list({ archived }: ListProjectsQuery = { archived: false }) {
    if (archived) {
      const items = await this.db
        .select()
        .from(projects)
        .where(and(isNull(projects.deletedAt), isNotNull(projects.archivedAt)))
        .orderBy(desc(projects.archivedAt), asc(projects.id))
      return { items }
    }
    await this.archiveStale()
    const items = await this.db
      .select()
      .from(projects)
      .where(onBoard)
      .orderBy(asc(projects.order), asc(projects.createdAt), asc(projects.id))
    return { items }
  }

  /** New projects go to the top of their column. */
  async create({ pauseReason, ...input }: CreateProjectBody): Promise<Project> {
    const status = input.status ?? "idea"
    return this.db.transaction(async (tx) => {
      const column = await this.columnIds(tx, status)
      const [row] = await tx
        .insert(projects)
        .values({
          id: ulid(),
          ...input,
          status,
          order: 0,
          statusChangedAt: new Date(),
          pauseReason: status === "paused" ? pauseReason || null : null,
        })
        .returning()
      await this.writeOrder(tx, [row.id, ...column])
      await this.recordStatus(tx, row)
      return row
    })
  }

  /** Any project that isn't deleted, archived ones included. */
  async get(id: string): Promise<Project> {
    const [row] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    if (!row) throw new NotFoundError("Project not found.")
    return row
  }

  async history(id: string) {
    await this.get(id)
    const items = await this.db
      .select()
      .from(projectStatusChanges)
      .where(eq(projectStatusChanges.projectId, id))
      .orderBy(desc(projectStatusChanges.changedAt), desc(projectStatusChanges.id))
    return { items }
  }

  /** A status change moves the project to the top of its new column. */
  async update(id: string, { status, pauseReason, ...input }: UpdateProjectBody): Promise<Project> {
    return this.db.transaction(async (tx) => {
      const current = await this.findOnBoard(tx, id)
      if (status && status !== current.status) await this.place(tx, current, status, 0, pauseReason)
      // Moving into Paused already stored the reason; this only edits the reason of a project that stays paused.
      const staysPaused = current.status === "paused" && (status ?? "paused") === "paused"
      const reason = staysPaused && pauseReason !== undefined ? { pauseReason: pauseReason || null } : {}
      const [row] = await tx
        .update(projects)
        .set({ ...input, ...reason, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning()
      return row
    })
  }

  /** Drops the project at `order` in the `status` column, keeping both affected columns gapless. */
  async move(id: string, { status, order, pauseReason }: MoveProjectBody) {
    await this.db.transaction(async (tx) => {
      await this.place(tx, await this.findOnBoard(tx, id), status, order, pauseReason)
    })
    return this.list()
  }

  async archive(id: string): Promise<Project> {
    const project = await this.findOnBoard(this.db, id)
    if (project.status !== "done") throw new BadRequestError("project_not_done", "Only done projects can be archived.")
    const [row] = await this.db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, id)).returning()
    return row
  }

  /**
   * Undoes a delete, or brings an archived project back to the top of Done.
   * The latter restarts its time in Done, so it isn't archived again right away.
   */
  async restore(id: string): Promise<Project> {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), or(isNotNull(projects.deletedAt), isNotNull(projects.archivedAt))))
    if (!project) throw new NotFoundError("Project not found.")
    if (project.deletedAt) {
      const [row] = await this.db.update(projects).set({ deletedAt: null }).where(eq(projects.id, id)).returning()
      return row
    }
    return this.db.transaction(async (tx) => {
      await this.writeOrder(tx, [id, ...(await this.columnIds(tx, "done"))])
      const now = new Date()
      const [row] = await tx
        .update(projects)
        .set({ archivedAt: null, status: "done", pauseReason: null, statusChangedAt: now, updatedAt: now })
        .where(eq(projects.id, id))
        .returning()
      await this.recordStatus(tx, row)
      return row
    })
  }

  async remove(id: string) {
    const [row] = await this.db
      .update(projects)
      .set({ deletedAt: new Date() })
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
      .returning({ id: projects.id })
    if (!row) throw new NotFoundError("Project not found.")
  }

  private async archiveStale() {
    const now = Date.now()
    await this.db
      .update(projects)
      .set({ archivedAt: new Date(now) })
      .where(and(onBoard, eq(projects.status, "done"), lt(projects.statusChangedAt, new Date(now - ARCHIVE_AFTER_MS))))
  }

  private async findOnBoard(db: Db | Tx, id: string) {
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), onBoard))
    if (!row) throw new NotFoundError("Project not found.")
    return row
  }

  private async place(tx: Tx, project: Project, status: ProjectStatus, order: number, pauseReason?: string | null) {
    const target = (await this.columnIds(tx, status)).filter((id) => id !== project.id)
    target.splice(Math.min(order, target.length), 0, project.id)
    await this.writeOrder(tx, target)
    if (status === project.status) return

    await this.writeOrder(tx, (await this.columnIds(tx, project.status)).filter((id) => id !== project.id))
    const now = new Date()
    const [row] = await tx
      .update(projects)
      .set({ status, statusChangedAt: now, pauseReason: status === "paused" ? pauseReason || null : null, updatedAt: now })
      .where(eq(projects.id, project.id))
      .returning()
    await this.recordStatus(tx, row)
  }

  private async columnIds(tx: Tx, status: ProjectStatus) {
    const rows = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(onBoard, eq(projects.status, status)))
      .orderBy(asc(projects.order), asc(projects.createdAt), asc(projects.id))
    return rows.map((row) => row.id)
  }

  private async writeOrder(tx: Tx, ids: string[]) {
    for (const [order, id] of ids.entries()) {
      await tx.update(projects).set({ order }).where(eq(projects.id, id))
    }
  }

  private async recordStatus(tx: Tx, project: Project) {
    await tx.insert(projectStatusChanges).values({
      id: ulid(),
      projectId: project.id,
      status: project.status,
      pauseReason: project.pauseReason,
      changedAt: project.statusChangedAt,
    })
  }
}
