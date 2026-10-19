import { useTranslation } from "react-i18next"
import { Minus } from "lucide-react"
import { HabitProgressRing } from "@/components/habits/habit-progress-ring"
import { Button } from "@/components/ui/button"
import { useLogHabit } from "@/hooks/queries/use-habits"
import { habitUnit } from "@/lib/habits"
import { errorMessage } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { DashboardHabitRowProps } from "@/types/dashboard"

/** A habit's check-in for today, with the same ring and Undo step as the Habits page. */
export function DashboardHabitRow({ habit }: DashboardHabitRowProps) {
  const { t } = useTranslation()
  const log = useLogHabit()
  const unit = habitUnit(habit.unit)

  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl", habit.doneToday && "opacity-60")} aria-hidden="true">
        {habit.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", habit.doneToday && "text-muted-foreground")}>{habit.name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{habit.todayCount} / {habit.target} {unit}</p>
        <p className="truncate text-xs text-primary">{habit.doneToday ? t("habits.goalMet") : t("habits.addAmount", { amount: habit.step, unit })}</p>
        {log.error ? <p role="alert" className="text-xs text-destructive">{errorMessage(log.error)}</p> : null}
      </div>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("habits.undo", { name: habit.name })}
        disabled={habit.todayCount === 0 || log.isPending}
        onClick={() => log.mutate({ id: habit.id, input: { delta: -habit.step } })}
      >
        <Minus />
        <span className="max-sm:sr-only">{t("habits.undoShort")}</span>
      </Button>
      <HabitProgressRing habit={habit} pending={log.isPending} onLog={() => log.mutate({ id: habit.id, input: { delta: habit.step } })} />
    </li>
  )
}
