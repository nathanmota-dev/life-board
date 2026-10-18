import { useTranslation } from "react-i18next"
import { Minus, Pencil, Plus, Trash2 } from "lucide-react"
import { HabitWeek } from "@/components/habits/habit-week"
import { RowActions } from "@/components/shared/row-actions"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useLogHabit, useRemoveHabit } from "@/hooks/queries/use-habits"
import { habitProgress, habitUnit } from "@/lib/habits"
import type { HabitRowProps } from "@/types/habit"

export function HabitRow({ habit, week, onEdit }: HabitRowProps) {
  const { t } = useTranslation()
  const log = useLogHabit()
  const remove = useRemoveHabit()

  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-5 py-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-sm font-semibold text-primary uppercase">
          {habit.name.charAt(0)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{habit.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {habit.todayCount} / {habit.target} {habitUnit(habit.unit)} · {t("habits.streakDays", { count: habit.streak })}
          </p>
        </div>
      </div>
      <div className="col-span-2 flex items-center gap-3 md:col-span-1">
        <Progress
          value={habitProgress(habit)}
          aria-label={t("common.itemProgress", { title: habit.name })}
          aria-valuenow={habit.todayCount}
          className="h-1.5"
        />
        {habit.doneToday ? <StatusBadge label={t("common.done")} tone="success" /> : null}
      </div>
      <div className="hidden lg:block">
        <HabitWeek week={week} />
      </div>
      <div className="col-start-2 row-start-1 flex items-center gap-1 md:col-start-auto md:row-start-auto">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("habits.undo", { name: habit.name })}
          disabled={habit.todayCount === 0 || log.isPending}
          onClick={() => log.mutate({ id: habit.id, input: { delta: -1 } })}
        >
          <Minus />
        </Button>
        <Button
          size="icon-sm"
          aria-label={t("habits.log", { name: habit.name })}
          disabled={log.isPending}
          onClick={() => log.mutate({ id: habit.id, input: { delta: 1 } })}
        >
          <Plus />
        </Button>
        <RowActions
          label={t("common.itemActions", { title: habit.name })}
          actions={[
            { label: t("common.edit"), icon: Pencil, onSelect: () => onEdit(habit) },
            { label: t("common.delete"), icon: Trash2, destructive: true, onSelect: () => remove.mutate(habit.id) },
          ]}
        />
      </div>
    </li>
  )
}
