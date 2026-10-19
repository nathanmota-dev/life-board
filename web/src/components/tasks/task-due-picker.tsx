import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { fromDateInput, toDateInput } from "@/lib/dates"
import type { TaskDuePickerProps } from "@/types/task"

export function TaskDuePicker({ value, onChange }: TaskDuePickerProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2">
      <Input type="date" aria-label={t("tasks.dueDate")} value={toDateInput(value)} onChange={(event) => onChange(fromDateInput(event.target.value))} />
      <Button type="button" size="sm" variant="ghost" disabled={value === null} onClick={() => onChange(null)}>
        {t("tasks.clearDueDate")}
      </Button>
    </div>
  )
}
