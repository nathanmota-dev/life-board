import { formatDate, fromDateInput, fromDayKey } from "@/lib/dates"
import { i18n } from "@/lib/i18n"
import { getTaskPriorityLabels } from "@/lib/tasks"
import type { CaptureToken, ParsedCapture } from "@/types/inbox"
import type { TaskInput, TaskPriority } from "@/types/task"
import type { ThoughtInput } from "@/types/thought"

/** The chip text for a recognized capture token: "casa", "High priority", "Due Tue, Oct 20". */
export function captureTokenLabel(token: CaptureToken) {
  if (token.kind === "tag") return token.value
  if (token.kind === "priority") return i18n.t("inbox.chipPriority", { priority: getTaskPriorityLabels()[token.value as TaskPriority] })
  return i18n.t("inbox.chipDue", { date: formatDate(fromDayKey(token.value), { weekday: "short", day: "numeric", month: "short" }) })
}

/** An inbox task from a parsed capture; fields that weren't recognized are left to the API defaults. */
export function captureToTaskInput({ title, tags, priority, dueDay }: ParsedCapture): TaskInput {
  return {
    title,
    status: "inbox",
    ...(tags.length > 0 ? { tags } : {}),
    ...(priority ? { priority } : {}),
    ...(dueDay ? { dueAt: fromDateInput(dueDay) } : {}),
  }
}

export function captureToThoughtInput({ title, tags }: ParsedCapture): ThoughtInput {
  return tags.length > 0 ? { body: title, tags } : { body: title }
}
