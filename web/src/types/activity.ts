import type { LucideIcon } from "lucide-react"
import type { Goal } from "@/types/goal"
import type { MoodEntry } from "@/types/mood"
import type { WeekStats } from "@/types/stats"
import type { Task } from "@/types/task"
import type { Thought } from "@/types/thought"

export type ActivityItem = {
  id: string
  kind: "task" | "thought" | "mood" | "goal"
  title: string
  detail: string
  at: string
  icon: LucideIcon
}

export type ActivityDay = { day: string; items: ActivityItem[] }

export type ActivityTimelineProps = { days: ActivityDay[] }

export type ActivityEntryProps = { item: ActivityItem }

export type WeekStatsGridProps = { stats: WeekStats | undefined }

export type ActivitySources = { tasks: Task[]; thoughts: Thought[]; mood: MoodEntry[]; goals: Goal[] }
