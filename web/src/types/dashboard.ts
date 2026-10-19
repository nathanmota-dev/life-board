import type { CalendarEvent } from "@/types/calendar"
import type { Goal } from "@/types/goal"
import type { Habit } from "@/types/habit"
import type { MoodEntry, MoodToday } from "@/types/mood"
import type { Task } from "@/types/task"

export const DASHBOARD_WIDGETS = ["myDay", "focus", "habits", "mood", "goals"] as const

export type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number]

/** Widgets in display order, plus the ones the user hid; `quickCapture` shows the capture bar on top. */
export type DashboardLayout = { order: DashboardWidgetId[]; hidden: DashboardWidgetId[]; quickCapture: boolean }

export type TimelineEventState = "past" | "current" | "next" | "upcoming"

export type TimelineItem = { event: CalendarEvent; state: TimelineEventState }

/** Today's events: all-day ones apart, timed ones in order with the "now" line after the first `nowIndex`. */
export type DayTimeline = { allDay: CalendarEvent[]; items: TimelineItem[]; nowIndex: number }

/** Yesterday's unfinished focus: the tasks that fit in today's free slots, and the rest. */
export type FocusRolloverPlan = { keep: Task[]; drop: Task[] }

export type DaySummaryCounts = { tasksCompleted: number; habitsMet: number; habitsTotal: number; eventsHeld: number }

export type DashboardStatsProps = {
  tasksToday: Task[]
  habits: Habit[]
  events: CalendarEvent[]
  mood: MoodToday | undefined
}

export type GoalsProgressListProps = { goals: Goal[] }

/** `fullRow` makes a widget that is alone on its row take the whole width. */
export type DashboardWidgetProps = { id: DashboardWidgetId; fullRow: boolean }

export type DashboardCustomizeMenuProps = {
  layout: DashboardLayout
  onToggle: (id: DashboardWidgetId) => void
  onMove: (id: DashboardWidgetId, offset: -1 | 1) => void
  onToggleQuickCapture: () => void
  onReset: () => void
}

export type NowLineProps = { now: Date }

export type TimelineListProps = { timeline: DayTimeline; now: Date; onOpen: (event: CalendarEvent) => void }

export type TimelineEventProps = { item: TimelineItem; now: Date; onOpen: (event: CalendarEvent) => void }

export type FocusTaskListProps = { tasks: Task[] }

export type FocusTaskPickerProps = { today: string; focus: Task[] }

export type FocusRolloverProps = { today: string; unfinished: Task[]; freeSlots: number }

export type DashboardHabitListProps = { habits: Habit[] }

export type DashboardHabitRowProps = { habit: Habit }

export type MoodWidgetBodyProps = { today: MoodToday }

export type DaySummaryProps = { entry: MoodEntry; onChange: () => void }
