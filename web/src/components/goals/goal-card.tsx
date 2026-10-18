import { CalendarClock } from "lucide-react"
import { StatusBadge } from "@/components/shared/status-badge"
import { Progress } from "@/components/ui/progress"
import { formatDate } from "@/lib/dates"
import { capitalize } from "@/lib/format"
import { GOAL_STATUS_TONES } from "@/lib/goals"
import type { GoalCardProps } from "@/types/goal"

export function GoalCard({ goal, onOpen }: GoalCardProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(goal)}
      className="flex min-w-0 cursor-pointer flex-col gap-4 rounded-2xl border bg-card p-4 text-left shadow-xs transition-colors hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            <span className="truncate">{goal.title}</span>
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{goal.why || "No motivation written yet."}</p>
        </div>
        <StatusBadge label={capitalize(goal.status)} tone={GOAL_STATUS_TONES[goal.status]} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{capitalize(goal.domain)}</span>
          <span className="font-medium text-foreground tabular-nums">{goal.progress}%</span>
        </div>
        <Progress value={goal.progress} aria-label={`${goal.title} progress`} className="h-1.5" />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="size-3.5" />
        {goal.targetAt ? `Target ${formatDate(goal.targetAt, { month: "short", day: "numeric", year: "numeric" })}` : "No target date"}
      </p>
    </button>
  )
}
