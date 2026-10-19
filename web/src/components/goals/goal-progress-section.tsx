import { useTranslation } from "react-i18next"
import { GoalManualProgress } from "@/components/goals/goal-manual-progress"
import { GoalProgressBreakdown } from "@/components/goals/goal-progress-breakdown"
import { GoalRiskBadge } from "@/components/goals/goal-risk-badge"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { Progress } from "@/components/ui/progress"
import { useUpdateGoal } from "@/hooks/queries/use-goals"
import type { GoalProgressMode, GoalProgressSectionProps } from "@/types/goal"

export function GoalProgressSection({ goal }: GoalProgressSectionProps) {
  const { t } = useTranslation()
  const update = useUpdateGoal()
  // Switching to manual keeps the current number, so nothing jumps.
  const setMode = (progressMode: GoalProgressMode) =>
    update.mutate({ id: goal.id, input: progressMode === "manual" ? { progressMode, progress: goal.progress } : { progressMode } })

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{t("goals.progress")}</span>
        <SegmentedControl<GoalProgressMode>
          label={t("goals.progressMode")}
          value={goal.progressMode}
          onChange={setMode}
          options={[
            { value: "auto", label: t("goals.modeAuto") },
            { value: "manual", label: t("goals.modeManual") },
          ]}
        />
      </div>
      <div className="flex items-center gap-3">
        <Progress value={goal.progress} aria-label={t("goals.goalProgress")} className="h-2 flex-1" />
        <span className="text-sm font-medium tabular-nums">{goal.progress}%</span>
      </div>
      {goal.progressMode === "manual" ? <GoalManualProgress key={goal.progress} goal={goal} /> : <GoalProgressBreakdown goal={goal} />}
      {goal.expectedProgress !== null ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{t("goals.expectedProgress", { percent: goal.expectedProgress })}</span>
          <GoalRiskBadge risk={goal.risk} />
        </div>
      ) : null}
    </section>
  )
}
