import { DayCalendar } from "@/components/shared/day-calendar"
import { fromDateInput, toDateInput } from "@/lib/dates"
import type { TaskDuePickerProps } from "@/types/task"

export function TaskDuePicker({ value, onChange }: TaskDuePickerProps) {
  return <DayCalendar value={toDateInput(value)} clearable onChange={(day) => onChange(fromDateInput(day))} />
}
