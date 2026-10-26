export type Habit = {
  id: string
  name: string
  unit: string
  target: number
  step: number
  emoji: string
  todayCount: number
  doneToday: boolean
  streak: number
  createdAt: string
}

export type HabitInput = { name: string; target: number; unit?: string; step: number; emoji: string }

export type HabitLog = { habitId: string; day: string; count: number; target?: number | null }

export type HabitLogInput = { delta: number; day?: string }

export type HabitLogEdit = { id: string; day: string; count: number }

export type HabitLogFilters = { from?: string; to?: string; habitId?: string }

export type HabitDay = { day: string; label: string; count: number; done: boolean; eligible: boolean; target: number }

export type HabitChartPoint = { day: string; label: string; met: number; partial: number; missed: number; pending: number }

export type HabitFormValues = { name: string; target: string; unit: string; step: string; emoji: string }

export type HabitDayStatus = "notTracked" | "completed" | "partial" | "pending" | "missed"

export type HabitDayEdit = { habit: Habit; entry: HabitDay }

export type HabitRowProps = { habit: Habit; week: HabitDay[]; onEdit: (habit: Habit) => void; onEditDay: (edit: HabitDayEdit) => void }

export type HabitWeekProps = { habit: Habit; week: HabitDay[]; onEditDay: (edit: HabitDayEdit) => void }

export type HabitStatsProps = { habits: Habit[]; logs: HabitLog[] }

export type HabitListProps = { habits: Habit[]; logs: HabitLog[]; onEdit: (habit: Habit) => void; onEditDay: (edit: HabitDayEdit) => void }

export type HabitWeekTrackerProps = { habits: Habit[]; onEditDay: (edit: HabitDayEdit) => void }

export type HabitTrackerCellProps = { habit: Habit; entry: HabitDay; onEditDay: (edit: HabitDayEdit) => void }

export type HabitDayDialogProps = { edit: HabitDayEdit; onClose: () => void }

export type HabitHistoryChartProps = { habits: Habit[]; logs: HabitLog[]; days: string[] }

export type HabitFormDialogProps = { open: boolean; habit: Habit | null; onOpenChange: (open: boolean) => void }

export type HabitDialogState = { open: boolean; habit: Habit | null }

export type HabitFilter = "all" | "pending" | "done"
export type HabitProgressRingProps = { habit: Habit; pending: boolean; onLog: () => void }
export type HabitAnalyticsProps = { habits: Habit[]; onEditDay: (edit: HabitDayEdit) => void }
export type HabitHistoryTableProps = HabitHistoryChartProps & { onEditDay: (edit: HabitDayEdit) => void }
export type HabitEmojiPickerProps = { value: string; onChange: (value: string) => void }
