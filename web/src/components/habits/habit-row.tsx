import { useTranslation } from "react-i18next"
import { Flame, Minus, Pencil, Trash2 } from "lucide-react"
import { HabitWeek } from "@/components/habits/habit-week"
import { HabitProgressRing } from "@/components/habits/habit-progress-ring"
import { RowActions } from "@/components/shared/row-actions"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useLogHabit, useRemoveHabit } from "@/hooks/queries/use-habits"
import { habitProgress, habitUnit } from "@/lib/habits"
import { errorMessage } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { HabitRowProps } from "@/types/habit"

export function HabitRow({ habit, week, onEdit }: HabitRowProps) {
  const { t } = useTranslation()
  const log = useLogHabit()
  const remove = useRemoveHabit()
  const unit = habitUnit(habit.unit)

  return (
    <li className={cn("flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs", habit.doneToday && "border-primary/30 bg-primary/3")}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-2xl" aria-hidden="true">{habit.emoji}</span>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <Flame className="size-3.5 text-primary" />{t("habits.streakDays", { count: habit.streak })}
        </div>
        <RowActions label={t("common.itemActions", { title: habit.name })} actions={[
          { label: t("common.edit"), icon: Pencil, onSelect: () => onEdit(habit) },
          { label: t("common.delete"), icon: Trash2, destructive: true, onSelect: () => remove.mutate(habit.id) },
        ]} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-base font-semibold">{habit.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">{habit.todayCount} / {habit.target} {unit}</p>
          <p className="mt-1 text-xs text-primary">{habit.doneToday ? t("habits.goalMet") : t("habits.addAmount", { amount: habit.step, unit })}</p>
        </div>
        <HabitProgressRing habit={habit} pending={log.isPending} onLog={() => log.mutate({ id: habit.id, input: { delta: habit.step } })} />
      </div>
      <Progress value={habitProgress(habit)} aria-label={t("common.itemProgress", { title: habit.name })} className="h-1.5" />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <HabitWeek week={week} />
        <Button variant="ghost" size="sm" aria-label={t("habits.undo", { name: habit.name })}
          disabled={habit.todayCount === 0 || log.isPending}
          onClick={() => log.mutate({ id: habit.id, input: { delta: -habit.step } })}>
          <Minus />{t("habits.undoShort")}
        </Button>
      </div>
      {log.error || remove.error ? <p role="alert" className="text-sm text-destructive">{errorMessage(log.error ?? remove.error)}</p> : null}
    </li>
  )
}
