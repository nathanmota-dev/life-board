import { useTranslation } from "react-i18next"
import { DayCalendar } from "@/components/shared/day-calendar"
import { fromDateInput, toDateInput } from "@/lib/dates"
import type { TaskDuePickerProps } from "@/types/task"

export function TaskDuePicker({ value, onChange }: TaskDuePickerProps) {
  const { t } = useTranslation()

  return <DayCalendar value={toDateInput(value)} clearLabel={t("tasks.clearDueDate")} onChange={(day) => onChange(fromDateInput(day))} />
}
