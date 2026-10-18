import type { CalendarEvent } from "@/types/calendar"
import type { Goal } from "@/types/goal"
import type { Habit } from "@/types/habit"
import type { MoodToday } from "@/types/mood"
import type { Task } from "@/types/task"

export type DashboardStatsProps = {
  tasksToday: Task[]
  habits: Habit[]
  events: CalendarEvent[]
  mood: MoodToday | undefined
}

export type TodayTasksListProps = { tasks: Task[] }

export type UpcomingEventsListProps = { events: CalendarEvent[] }

export type HabitsTodayListProps = { habits: Habit[] }

export type GoalsProgressListProps = { goals: Goal[] }
