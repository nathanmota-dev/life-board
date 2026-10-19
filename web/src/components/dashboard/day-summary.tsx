import { useTranslation } from "react-i18next"
import { Pencil } from "lucide-react"
import { DataState } from "@/components/shared/data-state"
import { Button } from "@/components/ui/button"
import { useCalendarEvents } from "@/hooks/queries/use-calendar"
import { useHabits } from "@/hooks/queries/use-habits"
import { useTasks } from "@/hooks/queries/use-tasks"
import { useNow } from "@/hooks/use-now"
import { daySummary, todayRange } from "@/lib/dashboard"
import { moodOption } from "@/lib/mood"
import type { DaySummaryProps } from "@/types/dashboard"

/** Today's saved mood and how the day went so far: tasks done, habits met and events held. */
export function DaySummary({ entry, onChange }: DaySummaryProps) {
  const { t } = useTranslation()
  const now = useNow(60_000)
  const done = useTasks({ status: "done", limit: 500 })
  const habits = useHabits()
  const events = useCalendarEvents(todayRange(now))
  const counts = daySummary(done.data ?? [], habits.data ?? [], events.data ?? [], now)
  const option = moodOption(entry.score)
  const stats = [
    { label: t("dashboard.tasksCompleted"), value: counts.tasksCompleted },
    { label: t("dashboard.habitsMet"), value: `${counts.habitsMet}/${counts.habitsTotal}` },
    { label: t("dashboard.eventsHeld"), value: counts.eventsHeld },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-4xl" aria-hidden="true">{option.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{option.label}</p>
          <p className="text-xs text-muted-foreground">{t("dashboard.checkedIn")}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onChange}>
          <Pencil />
          {t("dashboard.changeMood")}
        </Button>
      </div>
      {entry.note ? <p className="text-sm break-words text-muted-foreground">{entry.note}</p> : null}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t("dashboard.daySummary")}</h3>
        <DataState isLoading={done.isLoading || habits.isLoading || events.isLoading} error={done.error ?? habits.error ?? events.error}>
          <dl className="grid grid-cols-3 gap-2">
            {stats.map((stat) => (
              <div key={stat.label} className="min-w-0 rounded-xl border bg-muted/30 p-3">
                <dt className="truncate text-xs text-muted-foreground">{stat.label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </DataState>
      </div>
    </div>
  )
}
