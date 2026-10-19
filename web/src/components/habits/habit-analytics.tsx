import { useState } from "react"
import { useTranslation } from "react-i18next"
import { BarChart3, CalendarDays } from "lucide-react"
import { HabitHistoryChart } from "@/components/habits/habit-history-chart"
import { HabitHistoryTable } from "@/components/habits/habit-history-table"
import { DataState } from "@/components/shared/data-state"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { Input } from "@/components/ui/input"
import { Panel } from "@/components/workspace-ui"
import { useHabitLogs } from "@/hooks/queries/use-habits"
import { lastDays, toDayKey } from "@/lib/dates"
import { completionRate, goalsMetPerDay, habitDateRange } from "@/lib/habits"
import type { HabitAnalyticsProps, HabitPeriod } from "@/types/habit"

export function HabitAnalytics({ habits }: HabitAnalyticsProps) {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<HabitPeriod>("week")
  const [habitId, setHabitId] = useState("all")
  const [from, setFrom] = useState(lastDays(30)[0])
  const [to, setTo] = useState(toDayKey())
  const days = period === "custom" ? habitDateRange(from, to) : lastDays(period === "week" ? 7 : 30)
  const logs = useHabitLogs({ from: days[0] ?? toDayKey(), to: days.at(-1) ?? toDayKey() })
  const activeId = habits.some((habit) => habit.id === habitId) ? habitId : "all"
  const selected = habits.filter((habit) => activeId === "all" || habit.id === activeId)
  const items = logs.data ?? []
  const points = goalsMetPerDay(selected, items, days)
  const totals = points.reduce((total, point) => ({ met: total.met + point.met, partial: total.partial + point.partial, missed: total.missed + point.missed }), { met: 0, partial: 0, missed: 0 })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-base font-semibold">{t("habits.yourProgress")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("habits.progressDescription")}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={t("habits.filterHabit")} value={activeId} onChange={(event) => setHabitId(event.target.value)} className="h-8 max-w-48 rounded-lg border bg-background px-2 text-sm">
            <option value="all">{t("habits.allHabits")}</option>
            {habits.map((habit) => <option key={habit.id} value={habit.id}>{habit.emoji} {habit.name}</option>)}
          </select>
          <SegmentedControl<HabitPeriod> label={t("habits.period")} value={period} onChange={setPeriod} options={[
            { value: "week", label: t("habits.week") }, { value: "month", label: t("habits.month") }, { value: "custom", label: t("habits.custom") },
          ]} />
        </div>
      </div>
      {period === "custom" ? <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">{t("habits.from")}<Input type="date" className="mt-1 w-auto" value={from} max={to || toDayKey()} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-xs text-muted-foreground">{t("habits.to")}<Input type="date" className="mt-1 w-auto" value={to} min={from} max={toDayKey()} onChange={(event) => setTo(event.target.value)} /></label>
      </div> : null}
      {days.length === 0 ? <p role="alert" className="text-sm text-destructive">{t("habits.invalidRange")}</p> : <DataState isLoading={logs.isLoading} error={logs.error}>
        <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
          <div className="flex flex-col justify-between rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <div>
              <p className="text-sm font-medium">{t("habits.consistency")}</p>
              <p className="mt-3 text-5xl font-semibold tracking-tight text-primary tabular-nums">{completionRate(selected, items, days)}<span className="text-2xl">%</span></p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t("habits.consistencyHint", { count: days.length })}</p>
            </div>
            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between"><dt>{t("habits.completed")}</dt><dd className="font-medium tabular-nums">{totals.met}</dd></div>
              <div className="flex justify-between"><dt>{t("habits.partial")}</dt><dd className="font-medium tabular-nums">{totals.partial}</dd></div>
              <div className="flex justify-between"><dt>{t("habits.missed")}</dt><dd className="font-medium tabular-nums">{totals.missed}</dd></div>
            </dl>
          </div>
          <Panel title={t("habits.dailyProgress")} icon={BarChart3}>
            <HabitHistoryChart habits={selected} logs={items} days={days} />
          </Panel>
        </div>
        <Panel title={t("habits.history")} icon={CalendarDays}>
          <p className="mb-4 text-xs text-muted-foreground">{t("habits.historyDescription")}</p>
          <HabitHistoryTable habits={selected} logs={items} days={days} />
        </Panel>
      </DataState>}
    </div>
  )
}
