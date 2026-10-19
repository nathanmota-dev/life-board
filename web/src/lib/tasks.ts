import { arrayMove } from "@dnd-kit/sortable"
import { addDays, formatRelativeDay, fromDateInput, isSameDay, startOfDay, toDateInput } from "@/lib/dates"
import { parseTags } from "@/lib/format"
import { i18n } from "@/lib/i18n"
import {
  TASK_CHIPS,
  TASK_COLORS,
  type BoardTask,
  type ChecklistView,
  type Task,
  type TaskBoardFilters,
  type TaskBoardSection,
  type TaskChip,
  type TaskColor,
  type TaskDraft,
  type TaskDraftItem,
  type TaskFormValues,
  type TaskInput,
  type TaskLayout,
  type TaskOrderItem,
  type TaskPriority,
  type TaskSections,
  type TaskStatus,
} from "@/types/task"
import type { SelectOption, StatusTone } from "@/types/ui"

export function getTaskStatusLabels(): Record<TaskStatus, string> {
  return {
    inbox: i18n.t("taskStatuses.inbox"),
    today: i18n.t("taskStatuses.today"),
    upcoming: i18n.t("taskStatuses.upcoming"),
    someday: i18n.t("taskStatuses.someday"),
    done: i18n.t("taskStatuses.done"),
  }
}

export function getTaskPriorityLabels(): Record<TaskPriority, string> {
  return {
    none: i18n.t("priorities.none"),
    low: i18n.t("priorities.low"),
    medium: i18n.t("priorities.medium"),
    high: i18n.t("priorities.high"),
  }
}

export function getTaskStatusOptions(): SelectOption<TaskStatus>[] {
  return Object.entries(getTaskStatusLabels()).map(([value, label]) => ({ value: value as TaskStatus, label }))
}

export function getTaskPriorityOptions(): SelectOption<TaskPriority>[] {
  return Object.entries(getTaskPriorityLabels()).map(([value, label]) => ({ value: value as TaskPriority, label }))
}

export const STATUS_TONES: Record<TaskStatus, StatusTone> = {
  inbox: "neutral",
  today: "brand",
  upcoming: "info",
  someday: "neutral",
  done: "success",
}

export const PRIORITY_TONES: Record<TaskPriority, StatusTone> = { none: "neutral", low: "info", medium: "warning", high: "danger" }

export function isOverdue(task: Task, now = new Date()) {
  return task.status !== "done" && task.dueAt !== null && new Date(task.dueAt) < startOfDay(now)
}

export function dueLabel(task: Task) {
  return task.dueAt ? formatRelativeDay(task.dueAt) : "—"
}

export function emptyTaskValues(status: TaskStatus = "inbox"): TaskFormValues {
  return { title: "", description: "", status, priority: "none", dueAt: "", tags: "", linkedThoughtIds: [] }
}

export function taskToValues(task: Task): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    priority: task.priority,
    dueAt: toDateInput(task.dueAt),
    tags: task.tags.join(", "),
    linkedThoughtIds: task.linkedThoughtIds,
  }
}

export function valuesToInput(values: TaskFormValues): TaskInput {
  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    status: values.status,
    priority: values.priority,
    dueAt: fromDateInput(values.dueAt),
    tags: parseTags(values.tags),
    linkedThoughtIds: values.linkedThoughtIds,
  }
}

export function countByStatus(tasks: Task[]) {
  return tasks.reduce<Record<TaskStatus, number>>(
    (counts, task) => ({ ...counts, [task.status]: counts[task.status] + 1 }),
    { inbox: 0, today: 0, upcoming: 0, someday: 0, done: 0 },
  )
}

// Soft tones that keep the default text legible on both themes.
export const TASK_COLOR_CLASSES: Record<TaskColor, { card: string; swatch: string }> = {
  red: { card: "border-red-200 bg-red-50 dark:border-red-900/70 dark:bg-red-950/40", swatch: "bg-red-200 dark:bg-red-800" },
  orange: { card: "border-orange-200 bg-orange-50 dark:border-orange-900/70 dark:bg-orange-950/40", swatch: "bg-orange-200 dark:bg-orange-800" },
  yellow: { card: "border-yellow-200 bg-yellow-50 dark:border-yellow-900/70 dark:bg-yellow-950/40", swatch: "bg-yellow-200 dark:bg-yellow-700" },
  green: { card: "border-green-200 bg-green-50 dark:border-green-900/70 dark:bg-green-950/40", swatch: "bg-green-200 dark:bg-green-800" },
  teal: { card: "border-teal-200 bg-teal-50 dark:border-teal-900/70 dark:bg-teal-950/40", swatch: "bg-teal-200 dark:bg-teal-800" },
  blue: { card: "border-blue-200 bg-blue-50 dark:border-blue-900/70 dark:bg-blue-950/40", swatch: "bg-blue-200 dark:bg-blue-800" },
  purple: { card: "border-purple-200 bg-purple-50 dark:border-purple-900/70 dark:bg-purple-950/40", swatch: "bg-purple-200 dark:bg-purple-800" },
  pink: { card: "border-pink-200 bg-pink-50 dark:border-pink-900/70 dark:bg-pink-950/40", swatch: "bg-pink-200 dark:bg-pink-800" },
  gray: { card: "border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/60", swatch: "bg-zinc-300 dark:bg-zinc-600" },
}

export function getTaskColorOptions() {
  return TASK_COLORS.map((value) => ({ value, label: i18n.t(`taskColors.${value}`) }))
}

export function getTaskChipOptions() {
  const labels: Record<TaskChip, string> = {
    all: i18n.t("common.all"),
    today: i18n.t("common.today"),
    upcoming: i18n.t("tasks.upcoming"),
    someday: i18n.t("tasks.someday"),
    overdue: i18n.t("tasks.overdue"),
    archived: i18n.t("tasks.archivedFilter"),
    completed: i18n.t("tasks.completed"),
  }
  return TASK_CHIPS.map((value) => ({ value, label: labels[value] }))
}

export const TASK_LAYOUT_STORAGE_KEY = "life-board-tasks-layout"

export function readTaskLayout(): TaskLayout {
  try {
    return window.localStorage.getItem(TASK_LAYOUT_STORAGE_KEY) === "list" ? "list" : "board"
  } catch {
    return "board"
  }
}

export function saveTaskLayout(layout: TaskLayout) {
  try {
    window.localStorage.setItem(TASK_LAYOUT_STORAGE_KEY, layout)
  } catch {
    // Storage can be unavailable; the board is the default anyway.
  }
}

export const DEFAULT_BOARD_FILTERS: TaskBoardFilters = { chip: "all", tag: null, color: null }

/**
 * Done tasks only show under Completed. Today and Upcoming match the status or the due date;
 * archived tasks are filtered by the API.
 */
export function matchesChip(task: Task, chip: TaskChip, now = new Date()) {
  if (chip === "archived") return true
  if (chip === "completed") return task.status === "done"
  if (task.status === "done") return false
  const due = task.dueAt ? new Date(task.dueAt) : null
  if (chip === "today") return task.status === "today" || (due !== null && isSameDay(due, now))
  if (chip === "upcoming") return task.status === "upcoming" || (due !== null && due >= addDays(startOfDay(now), 1))
  if (chip === "someday") return task.status === "someday"
  if (chip === "overdue") return isOverdue(task, now)
  return true
}

export function filterBoardTasks<T extends Task>(tasks: T[], { chip, tag, color }: TaskBoardFilters, now = new Date()) {
  return tasks.filter((task) => matchesChip(task, chip, now) && (!tag || task.tags.includes(tag)) && (!color || task.color === color))
}

export function hasActiveFilters({ chip, tag, color }: TaskBoardFilters, search: string) {
  return chip !== "all" || tag !== null || color !== null || search.trim() !== ""
}

export function collectTags(tasks: Task[]) {
  return [...new Set(tasks.flatMap((task) => task.tags))].sort()
}

function byBoardOrder(a: Task, b: Task) {
  return a.order - b.order || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
}

/** Tasks split into Pinned and Others in their hand-made order. */
export function groupBoardTasks(tasks: BoardTask[]): TaskSections {
  const sorted = [...tasks].sort(byBoardOrder)
  return { pinned: sorted.filter((task) => task.pinned), others: sorted.filter((task) => !task.pinned) }
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2, none: 3 }

/** The List view's order: open first, then by priority, then by due date (undated last). */
export function sortForList<T extends Task>(tasks: T[]) {
  const due = (task: Task) => (task.dueAt ? new Date(task.dueAt).getTime() : Number.POSITIVE_INFINITY)
  return [...tasks].sort(
    (a, b) =>
      Number(a.status === "done") - Number(b.status === "done") ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      due(a) - due(b) ||
      b.createdAt.localeCompare(a.createdAt),
  )
}

/** Open items first; ticked ones below, collapsed after `limit` unless expanded. */
export function checklistView(items: Task[], expanded = false, limit = 3): ChecklistView {
  const done = items.filter((item) => item.status === "done")
  const visible = expanded ? done : done.slice(0, limit)
  return { open: items.filter((item) => item.status !== "done"), done: visible, hiddenDone: done.length - visible.length }
}

export function canCompleteFromChecklist(task: BoardTask) {
  return task.status !== "done" && task.children.length > 0 && task.children.every((item) => item.status === "done")
}

function sectionOf(sections: Pick<TaskSections, TaskBoardSection>, id: string): TaskBoardSection | null {
  if (id === "pinned" || id === "others") return id
  if (sections.pinned.some((task) => task.id === id)) return "pinned"
  return sections.others.some((task) => task.id === id) ? "others" : null
}

/**
 * The sections after dropping `activeId` on `overId`, a card or a section's
 * empty area, or null when nothing moved. Moving across sections pins or unpins.
 */
export function moveBoardTask(sections: Pick<TaskSections, TaskBoardSection>, activeId: string, overId: string | null) {
  const from = sectionOf(sections, activeId)
  const to = overId ? sectionOf(sections, overId) : null
  if (!from || !to || !overId || activeId === overId || activeId === from) return null

  const source = sections[from]
  const fromIndex = source.findIndex((task) => task.id === activeId)
  if (from === to) {
    const toIndex = overId === to ? source.length - 1 : source.findIndex((task) => task.id === overId)
    return fromIndex === toIndex ? null : { ...sections, [from]: arrayMove(source, fromIndex, toIndex) }
  }

  const target = [...sections[to]]
  const at = overId === to ? target.length : target.findIndex((task) => task.id === overId)
  target.splice(at, 0, { ...source[fromIndex], pinned: to === "pinned" })
  return { ...sections, [from]: source.filter((task) => task.id !== activeId), [to]: target }
}

export function boardOrder({ pinned, others }: Pick<TaskSections, TaskBoardSection>): TaskOrderItem[] {
  return [
    ...pinned.map((task, order) => ({ id: task.id, order, pinned: true })),
    ...others.map((task, index) => ({ id: task.id, order: pinned.length + index, pinned: false })),
  ]
}

let draftItemSeq = 0

export function newDraftItem(text = ""): TaskDraftItem {
  draftItemSeq += 1
  return { id: `draft-item-${draftItemSeq}`, text }
}

export function emptyDraft(): TaskDraft {
  return { title: "", notes: "", checklist: false, items: [newDraftItem()] }
}

/** Switches between notes and checklist, turning lines into items and back. */
export function toggleDraftChecklist(draft: TaskDraft): TaskDraft {
  if (draft.checklist) {
    const notes = draft.items.map((item) => item.text.trim()).filter(Boolean).join("\n")
    return { ...draft, checklist: false, notes, items: [newDraftItem()] }
  }
  const lines = draft.notes.split("\n").map((line) => line.trim()).filter(Boolean)
  return { ...draft, checklist: true, notes: "", items: lines.length > 0 ? lines.map((line) => newDraftItem(line)) : [newDraftItem()] }
}

/** Enter in a checklist item: a new empty item right after it. */
export function insertDraftItem(items: TaskDraftItem[], afterId: string) {
  const item = newDraftItem()
  const index = items.findIndex((current) => current.id === afterId)
  return { items: [...items.slice(0, index + 1), item, ...items.slice(index + 1)], focusId: item.id }
}

/** Backspace on an empty item: removes it and focuses the one before, or after for the first (one item always stays). */
export function removeDraftItem(items: TaskDraftItem[], id: string) {
  const index = items.findIndex((item) => item.id === id)
  if (items.length <= 1 || index === -1) return null
  return { items: items.filter((item) => item.id !== id), focusId: items[index === 0 ? 1 : index - 1].id }
}

/** The task to create from the composer, or null for an empty draft. */
export function draftToInput(draft: TaskDraft): TaskInput | null {
  const title = draft.title.trim()
  const notes = draft.checklist ? "" : draft.notes.trim()
  const items = draft.checklist ? draft.items.map((item) => item.text.trim()).filter(Boolean) : []
  if (!title && !notes && items.length === 0) return null

  if (!title && notes) {
    const [first, ...rest] = notes.split("\n")
    return { title: first.trim().slice(0, 500), description: rest.join("\n").trim() || null }
  }
  return {
    title: title || i18n.t("tasks.untitledChecklist"),
    description: notes || null,
    ...(items.length > 0 ? { items } : {}),
  }
}
