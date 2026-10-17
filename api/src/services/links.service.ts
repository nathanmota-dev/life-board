import { and, inArray, isNull } from "drizzle-orm"
import type { Db } from "../db/client"
import {
  calendarEvents,
  goals,
  tasks,
  thoughts,
  type CalendarEvent,
  type Goal,
  type Task,
  type Thought,
} from "../db/schema"
import type { BacklinkTarget, ResolveLinksBody } from "../dto/links.dto"
import { jsonArrayContains } from "./query.service"

export type ResolvedLink =
  | { moduleId: "tasks"; entity: Task }
  | { moduleId: "thoughts"; entity: Thought }
  | { moduleId: "calendar"; entity: CalendarEvent }
  | { moduleId: "goals"; entity: Goal }

export type Backlink = {
  source: "tasks" | "thoughts" | "calendar" | "goals"
  sourceId: string
  label: string
  meta?: string
}

export class LinksService {
  constructor(private readonly db: Db) {}

  async resolve({ taskIds, thoughtIds, calendarIds, goalIds }: ResolveLinksBody) {
    const links: ResolvedLink[] = []
    if (taskIds.length) {
      const rows = await this.db.select().from(tasks).where(and(inArray(tasks.id, taskIds), isNull(tasks.deletedAt)))
      for (const entity of rows) links.push({ moduleId: "tasks", entity })
    }
    if (thoughtIds.length) {
      const rows = await this.db.select().from(thoughts).where(and(inArray(thoughts.id, thoughtIds), isNull(thoughts.deletedAt)))
      for (const entity of rows) links.push({ moduleId: "thoughts", entity })
    }
    if (calendarIds.length) {
      const rows = await this.db
        .select()
        .from(calendarEvents)
        .where(and(inArray(calendarEvents.id, calendarIds), isNull(calendarEvents.deletedAt)))
      for (const entity of rows) links.push({ moduleId: "calendar", entity })
    }
    if (goalIds.length) {
      const rows = await this.db.select().from(goals).where(and(inArray(goals.id, goalIds), isNull(goals.deletedAt)))
      for (const entity of rows) links.push({ moduleId: "goals", entity })
    }
    return links
  }

  /** Everything that links TO the target task or thought. */
  async backlinks({ kind, id }: BacklinkTarget) {
    const backlinks: Backlink[] = []

    if (kind === "thought") {
      const rows = await this.db
        .select()
        .from(tasks)
        .where(and(jsonArrayContains(tasks.linkedThoughtIds, id), isNull(tasks.deletedAt)))
      for (const task of rows) {
        backlinks.push({
          source: "tasks",
          sourceId: task.id,
          label: task.title,
          meta: task.status === "done" ? "done" : task.priority,
        })
      }
    } else {
      const rows = await this.db
        .select()
        .from(thoughts)
        .where(and(jsonArrayContains(thoughts.linkedTaskIds, id), isNull(thoughts.deletedAt)))
      for (const thought of rows) {
        backlinks.push({
          source: "thoughts",
          sourceId: thought.id,
          label: thought.title || stripHtml(thought.body).slice(0, 80) || "(untitled thought)",
        })
      }
    }

    const linkColumn = kind === "thought" ? "linkedThoughtIds" : "linkedTaskIds"
    const events = await this.db
      .select()
      .from(calendarEvents)
      .where(and(jsonArrayContains(calendarEvents[linkColumn], id), isNull(calendarEvents.deletedAt)))
    for (const event of events) {
      backlinks.push({ source: "calendar", sourceId: event.id, label: event.title, meta: event.startAt.toISOString() })
    }
    const linkedGoals = await this.db
      .select()
      .from(goals)
      .where(and(jsonArrayContains(goals[linkColumn], id), isNull(goals.deletedAt)))
    for (const goal of linkedGoals) {
      backlinks.push({ source: "goals", sourceId: goal.id, label: goal.title, meta: goal.status })
    }

    return backlinks
  }
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}
