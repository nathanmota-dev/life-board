import { useTranslation } from "react-i18next"
import { Check } from "lucide-react"
import { formatDate, fromDayKey } from "@/lib/dates"
import { cn } from "@/lib/utils"
import type { HabitWeekProps } from "@/types/habit"

export function HabitWeek({ habit, week, onEditDay }: HabitWeekProps) {
  const { t } = useTranslation()
  return (
    <ol className="flex gap-1" aria-label={t("common.last7Days")}>
      {week.map((day) => (
        <li key={day.day}>
          <button
            type="button"
            onClick={() => onEditDay({ habit, entry: day })}
            aria-label={t("habits.editDay", { name: habit.name, date: formatDate(fromDayKey(day.day), { weekday: "long", day: "numeric", month: "long" }) })}
            title={`${day.day}: ${day.eligible ? `${day.count} / ${day.target}` : t("habits.notTracked")}`}
            className={cn(
              "flex size-6 cursor-pointer items-center justify-center rounded-md border text-[10px] text-muted-foreground transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-ring",
              day.done && "border-primary bg-primary text-primary-foreground",
              !day.done && day.count > 0 && "border-chart-3/40 bg-chart-3/15",
              !day.eligible && "opacity-30 hover:opacity-100",
            )}
          >
            {day.done ? <Check className="size-3" aria-label={t("habits.goalMet")} /> : day.label}
          </button>
        </li>
      ))}
    </ol>
  )
}
