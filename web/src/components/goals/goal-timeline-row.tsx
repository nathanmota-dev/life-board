import { useTranslation } from "react-i18next"
import { GoalRiskBadge } from "@/components/goals/goal-risk-badge"
import { formatDate } from "@/lib/dates"
import { GOAL_DOMAIN_COLORS, timelineBar, timelinePosition } from "@/lib/goals"
import { cn } from "@/lib/utils"
import type { GoalTimelineRowProps } from "@/types/goal"

export function GoalTimelineRow({ goal, scale, onOpen }: GoalTimelineRowProps) {
  const { t } = useTranslation()
  const color = GOAL_DOMAIN_COLORS[goal.domain]
  const bar = timelineBar(scale, goal)

  return (
    <button
      type="button"
      onClick={() => onOpen(goal)}
      className="group grid w-full cursor-pointer grid-cols-[12rem_minmax(0,1fr)] border-b text-left last:border-b-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <span className="sticky left-0 z-10 flex min-w-0 flex-col justify-center gap-0.5 border-r bg-card px-3 py-2 group-hover:bg-muted">
        <span className="truncate text-sm font-medium">{goal.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="tabular-nums">{goal.progress}%</span>
          <GoalRiskBadge risk={goal.risk} />
        </span>
      </span>
      <span className="relative h-14 group-hover:bg-muted/30">
        {scale.months.map((month) => (
          <span key={month.key} className="absolute inset-y-0 border-l border-dashed" style={{ left: `${month.left}%` }} aria-hidden="true" />
        ))}
        <span
          className="absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded-full border"
          style={{ left: `${bar.left}%`, width: `${bar.width}%`, borderColor: color, background: `color-mix(in oklab, ${color} 22%, transparent)` }}
          aria-hidden="true"
        >
          <span className="block h-full" style={{ width: `${goal.progress}%`, background: color }} />
        </span>
        {goal.milestoneMarkers.map((marker) => (
          <span
            key={marker.id}
            role="img"
            aria-label={t("goals.milestoneMarker", { title: marker.title, date: formatDate(marker.dueAt) })}
            title={marker.title}
            className={cn("absolute top-1/2 size-2.5 -translate-1/2 rotate-45 border-2 border-foreground/70", marker.completedAt ? "bg-foreground/70" : "bg-background")}
            style={{ left: `${timelinePosition(scale, marker.dueAt)}%` }}
          />
        ))}
        <span className="absolute inset-y-0 w-px bg-primary" style={{ left: `${scale.today}%` }} aria-hidden="true" />
      </span>
    </button>
  )
}
