import { useTranslation } from "react-i18next"
import { GoalTimelineAxis } from "@/components/goals/goal-timeline-axis"
import { GoalTimelineRow } from "@/components/goals/goal-timeline-row"
import { GoalUndatedList } from "@/components/goals/goal-undated-list"
import { GOAL_DOMAIN_COLORS, groupByDomain, isScheduled, timelineScale } from "@/lib/goals"
import type { GoalTimelineProps } from "@/types/goal"

/** Rows by domain with a bar from start to target; scrolls sideways inside its own box. */
export function GoalTimeline({ goals, onOpen }: GoalTimelineProps) {
  const { t } = useTranslation()
  const scheduled = goals.filter(isScheduled)
  const scale = timelineScale(scheduled)
  // Room for each month to stay readable; narrower screens scroll the box, not the page.
  const minWidth = `calc(12rem + ${Math.max(480, scale.months.length * 96)}px)`

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {scheduled.length > 0 ? (
        <div role="region" aria-label={t("goals.timeline")} tabIndex={0} className="max-w-full overflow-x-auto rounded-2xl border bg-card shadow-xs">
          <div style={{ minWidth }}>
            <GoalTimelineAxis scale={scale} />
            {groupByDomain(scheduled).map((group) => (
              <div key={group.domain} role="group" aria-label={t(`goalDomains.${group.domain}`)} className="border-b last:border-b-0">
                <p className="sticky left-0 flex w-48 items-center gap-2 bg-card px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ background: GOAL_DOMAIN_COLORS[group.domain] }} aria-hidden="true" />
                  {t(`goalDomains.${group.domain}`)}
                </p>
                {group.goals.map((goal) => (
                  <GoalTimelineRow key={goal.id} goal={goal} scale={scale} onOpen={onOpen} />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("goals.noScheduledGoals")}</p>
      )}
      <GoalUndatedList goals={goals.filter((goal) => !isScheduled(goal))} onOpen={onOpen} />
    </div>
  )
}
