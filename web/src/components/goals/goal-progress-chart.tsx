import { useTranslation } from "react-i18next"
import { GoalProgressLine } from "@/components/goals/goal-progress-line"
import { DataState } from "@/components/shared/data-state"
import { PeriodFilter } from "@/components/shared/period-filter"
import { useGoalProgress } from "@/hooks/queries/use-goals"
import { usePeriod } from "@/hooks/use-period"
import { toDayKey } from "@/lib/dates"
import { progressSeries } from "@/lib/goals"
import type { GoalProgressChartProps } from "@/types/goal"

/** Progress over time, from the daily snapshots the API records. */
export function GoalProgressChart({ goalId }: GoalProgressChartProps) {
  const { t } = useTranslation()
  const period = usePeriod("month")
  const { days } = period
  const history = useGoalProgress(goalId, { from: days[0] ?? toDayKey(), to: days.at(-1) ?? toDayKey() })

  return (
    <div className="flex flex-col gap-3">
      <PeriodFilter state={period} />
      {days.length === 0 ? <p role="alert" className="text-sm text-destructive">{t("period.invalidRange")}</p> : (
        <DataState isLoading={history.isLoading} error={history.error}>
          <GoalProgressLine points={history.data ? progressSeries(history.data, days) : []} />
        </DataState>
      )}
    </div>
  )
}
