import type { CalendarEvent } from "@/types/calendar"
import type { Goal } from "@/types/goal"
import type { Task } from "@/types/task"
import type { Thought } from "@/types/thought"

export type LinkIds = { taskIds?: string[]; thoughtIds?: string[]; calendarIds?: string[]; goalIds?: string[] }

export type ResolvedLink =
  | { moduleId: "tasks"; entity: Task }
  | { moduleId: "thoughts"; entity: Thought }
  | { moduleId: "calendar"; entity: CalendarEvent }
  | { moduleId: "goals"; entity: Goal }

export type BacklinkTarget = { kind: "task" | "thought"; id: string }

export type Backlink = {
  source: "tasks" | "thoughts" | "calendar" | "goals"
  sourceId: string
  label: string
  meta?: string
}
