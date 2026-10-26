import { Check } from "lucide-react"
import { useTranslation } from "react-i18next"
import { formatDate, fromDayKey, toDayKey } from "@/lib/dates"
import { canEditHabitDay, habitDayStatus, habitUnit } from "@/lib/habits"
import { cn } from "@/lib/utils"
import type { HabitTrackerCellProps } from "@/types/habit"

export function HabitTrackerCell({ habit, entry, onEditDay }: HabitTrackerCellProps) {
  const { t } = useTranslation()
  const editable = canEditHabitDay(entry.day)
  const date = formatDate(fromDayKey(entry.day), { weekday: "long", day: "numeric", month: "long" })
  const description = `${t(`habits.${habitDayStatus(entry)}`)} · ${entry.count} / ${entry.target} ${habitUnit(habit.unit)}`

  return (
    <button
      type="button"
      disabled={!editable}
      onClick={() => onEditDay({ habit, entry })}
      aria-label={`${t("habits.editDay", { name: habit.name, date })} · ${description}`}
      title={editable ? description : undefined}
      className={cn(
        "flex h-11 w-full min-w-12 cursor-pointer items-center justify-center gap-1 rounded-lg border text-xs tabular-nums transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:border-dashed disabled:opacity-40 disabled:hover:border-border",
        entry.done ? "border-primary bg-primary text-primary-foreground" : entry.count > 0 ? "border-chart-3/40 bg-chart-3/15" : "text-muted-foreground",
        entry.day === toDayKey() && !entry.done && "border-primary/50",
      )}
    >
      {entry.done ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : null}
      {editable ? <span className="truncate">{entry.eligible ? entry.count : "—"}</span> : null}
    </button>
  )
}
