import { formatRelativeDay, fromDateInput, startOfDay, toDateInput } from "@/lib/dates"
import { parseTags } from "@/lib/format"
import type { Task, TaskFormValues, TaskInput, TaskPriority, TaskStatus } from "@/types/task"
import type { SelectOption, StatusTone } from "@/types/ui"

export const STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Inbox",
  today: "Today",
  upcoming: "Upcoming",
  someday: "Someday",
  done: "Done",
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = { none: "No priority", low: "Low", medium: "Medium", high: "High" }

export const STATUS_OPTIONS: SelectOption<TaskStatus>[] = Object.entries(STATUS_LABELS).map(([value, label]) => ({
  value: value as TaskStatus,
  label,
}))

export const PRIORITY_OPTIONS: SelectOption<TaskPriority>[] = Object.entries(PRIORITY_LABELS).map(([value, label]) => ({
  value: value as TaskPriority,
  label,
}))

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
