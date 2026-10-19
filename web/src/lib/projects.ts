import { i18n } from "@/lib/i18n"
import { startOfDay } from "@/lib/dates"
import type { BoardColumnItems, BoardMove } from "@/types/board"
import {
  PROJECT_STATUSES,
  type Project,
  type ProjectFormValues,
  type ProjectInput,
  type ProjectMove,
  type ProjectMoveInput,
  type ProjectStatus,
} from "@/types/project"
import type { SelectOption, StatusTone } from "@/types/ui"

export const PROJECT_STATUS_TONES: Record<ProjectStatus, StatusTone> = {
  idea: "info",
  planned: "neutral",
  in_progress: "brand",
  paused: "warning",
  done: "success",
}

/** How many Done projects the board shows until "Show all" is used. */
export const DONE_PREVIEW_LIMIT = 5

export const DEFAULT_WIP_LIMIT = 3

export const WIP_LIMIT_STORAGE_KEY = "life-board-projects-wip-limit"

const DAY_MS = 24 * 60 * 60 * 1000

export function getProjectStatusOptions(): SelectOption<ProjectStatus>[] {
  return PROJECT_STATUSES.map((value) => ({ value, label: i18n.t(`projectStatuses.${value}`) }))
}

export function emptyProjectValues(): ProjectFormValues {
  return { title: "", description: "", status: "idea", pauseReason: "" }
}

export function projectToValues(project: Project): ProjectFormValues {
  return { title: project.title, description: project.description, status: project.status, pauseReason: project.pauseReason ?? "" }
}

export function valuesToProjectInput(values: ProjectFormValues): ProjectInput {
  const input: ProjectInput = { title: values.title.trim(), description: values.description.trim(), status: values.status }
  return values.status === "paused" ? { ...input, pauseReason: values.pauseReason.trim() || null } : input
}

/** Each status column, sorted by its order. */
export function groupProjects(projects: Project[]): Record<ProjectStatus, Project[]> {
  const columns = Object.fromEntries(PROJECT_STATUSES.map((status) => [status, [] as Project[]])) as Record<ProjectStatus, Project[]>
  for (const project of projects) columns[project.status].push(project)
  for (const status of PROJECT_STATUSES) columns[status].sort((a, b) => a.order - b.order)
  return columns
}

/** The most recently finished Done projects, still in column order, unless all of them are wanted. */
export function visibleDoneProjects(done: Project[], showAll: boolean) {
  if (showAll || done.length <= DONE_PREVIEW_LIMIT) return done
  const recent = new Set(
    [...done]
      .sort((a, b) => b.statusChangedAt.localeCompare(a.statusChangedAt))
      .slice(0, DONE_PREVIEW_LIMIT)
      .map((project) => project.id),
  )
  return done.filter((project) => recent.has(project.id))
}

export function toBoardColumns(columns: Record<ProjectStatus, Project[]>, showAllDone: boolean): BoardColumnItems<Project>[] {
  return PROJECT_STATUSES.map((status) => ({
    id: status,
    items: status === "done" ? visibleDoneProjects(columns.done, showAllDone) : columns[status],
  }))
}

/**
 * Turns a board drop into a move request. `move.ids` only lists the visible cards,
 * so the project goes right after the visible card above it (or before the one below).
 */
export function toProjectMove(projects: Project[], move: BoardMove): ProjectMove {
  const status = move.to as ProjectStatus
  const rest = groupProjects(projects)[status].map((project) => project.id).filter((id) => id !== move.itemId)
  const index = move.ids.indexOf(move.itemId)
  const order = index > 0 ? rest.indexOf(move.ids[index - 1]) + 1 : Math.max(rest.indexOf(move.ids[1] ?? ""), 0)
  return { id: move.itemId, input: { status, order } }
}

/** Whether a move should first ask why the project is paused. */
export function needsPauseReason(projects: Project[], { id, input }: ProjectMove) {
  return input.status === "paused" && input.pauseReason === undefined && projects.find((project) => project.id === id)?.status !== "paused"
}

/** The board as it will be after the move, with both affected columns renumbered. */
export function applyProjectMove(projects: Project[], id: string, input: ProjectMoveInput, now = new Date()): Project[] {
  const project = projects.find((item) => item.id === id)
  if (!project) return projects
  const columns = groupProjects(projects.filter((item) => item.id !== id))
  const changed = project.status !== input.status
  const moved: Project = changed
    ? { ...project, status: input.status, statusChangedAt: now.toISOString(), pauseReason: input.status === "paused" ? input.pauseReason || null : null }
    : project
  columns[input.status].splice(Math.min(input.order, columns[input.status].length), 0, moved)
  const touched = new Set([project.status, input.status])
  return PROJECT_STATUSES.flatMap((status) =>
    touched.has(status) ? columns[status].map((item, order) => ({ ...item, order })) : columns[status],
  )
}

/** Whole days between the project's last status change and `now`. */
export function daysSinceStatusChange(project: Project, now = new Date()) {
  return Math.max(Math.round((startOfDay(now).getTime() - startOfDay(new Date(project.statusChangedAt)).getTime()) / DAY_MS), 0)
}

export function isOverWipLimit(count: number, limit: number | null) {
  return limit !== null && count > limit
}

/** The stored WIP limit: the default when unset, null when turned off. */
export function parseWipLimit(stored: string | null) {
  if (stored === null) return DEFAULT_WIP_LIMIT
  const limit = Number(stored)
  return Number.isInteger(limit) && limit > 0 ? limit : null
}

export function readWipLimit() {
  return parseWipLimit(window.localStorage.getItem(WIP_LIMIT_STORAGE_KEY))
}

export function storeWipLimit(limit: number | null) {
  window.localStorage.setItem(WIP_LIMIT_STORAGE_KEY, limit === null ? "off" : String(limit))
}
