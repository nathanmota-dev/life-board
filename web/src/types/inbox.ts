import type { Task } from "@/types/task"
import type { Thought } from "@/types/thought"

export type CaptureKind = "task" | "thought"

export type InboxTaskRowProps = { task: Task }

export type InboxTaskListProps = { tasks: Task[] }

export type RecentThoughtsProps = { thoughts: Thought[] }
