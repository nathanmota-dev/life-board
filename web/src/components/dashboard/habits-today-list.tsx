import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useLogHabit } from "@/hooks/queries/use-habits"
import { habitProgress, habitUnit } from "@/lib/habits"
import type { HabitsTodayListProps } from "@/types/dashboard"

export function HabitsTodayList({ habits }: HabitsTodayListProps) {
  const { t } = useTranslation()
  const log = useLogHabit()

  return (
    <ul className="flex flex-col gap-3">
      {habits.map((habit) => (
        <li key={habit.id} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium">{habit.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {habit.todayCount}/{habit.target} {habitUnit(habit.unit)}
              </span>
            </div>
            <Progress value={habitProgress(habit)} aria-label={t("common.itemProgress", { title: habit.name })} className="h-1.5" />
          </div>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label={t("habits.log", { name: habit.name })}
            disabled={log.isPending}
            onClick={() => log.mutate({ id: habit.id, input: { delta: habit.step } })}
          >
            <Plus />
          </Button>
        </li>
      ))}
    </ul>
  )
}
