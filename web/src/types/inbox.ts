import type { LucideIcon } from "lucide-react"
import type { Task, TaskPriority } from "@/types/task"
import type { Thought } from "@/types/thought"

export type CaptureKind = "task" | "thought"

export type InboxTaskRowProps = { task: Task }

export type InboxTaskListProps = { tasks: Task[] }

export type RecentThoughtsProps = { thoughts: Thought[] }

export type CaptureTokenKind = "tag" | "priority" | "due"

/** A recognized piece of the capture text. `value` is the tag, the priority or the due day (YYYY-MM-DD). */
export type CaptureToken = {
  kind: CaptureTokenKind
  text: string
  value: string
  start: number
  end: number
}

export type ParsedCapture = {
  title: string
  tags: string[]
  priority: TaskPriority | null
  dueDay: string | null
  tokens: CaptureToken[]
}

export type ParseCaptureOptions = {
  now?: Date
  /** Lowercased token texts the user chose to keep as literal text. */
  ignored?: ReadonlySet<string>
}

export type QuickCaptureProps = {
  autoFocus?: boolean
  onCaptured?: () => void
}

export type CapturePreviewProps = {
  tokens: CaptureToken[]
  onRemove: (token: CaptureToken) => void
}

export type TriageAction = "today" | "upcoming" | "someday" | "thought" | "edit" | "delete" | "skip" | "undo" | "exit"

export type TriageDecision =
  | { kind: "status"; task: Task }
  | { kind: "delete"; task: Task }
  | { kind: "thought"; task: Task; thoughtId: string }

export type TriageViewProps = { tasks: Task[]; onExit: () => void }

export type TriageActionOption = { action: TriageAction; label: string; icon: LucideIcon }

export type TriageActionsProps = { disabled: boolean; canUndo: boolean; onAction: (action: TriageAction) => void }

export type TriageDatePickerProps = {
  disabled: boolean
  onConfirm: (day: string) => void
  onCancel: () => void
}

export type TriageCardProps = { task: Task; position: number; total: number }

export type InboxZeroProps = { count: number; canUndo: boolean; onUndo: () => void; onExit: () => void }

export type InboxOverviewProps = { tasks: Task[]; isLoading: boolean; error: unknown }
