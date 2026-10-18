import { CalendarDays, CircleCheck, Flag, Lightbulb, ListChecks } from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"
import type { WeekStatsGridProps } from "@/types/activity"

export function WeekStatsGrid({ stats }: WeekStatsGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard icon={CircleCheck} label="Tasks completed" value={stats?.tasksCompleted ?? "—"} hint="This week" />
      <StatCard icon={Lightbulb} label="Thoughts" value={stats?.thoughtsCreated ?? "—"} hint="Captured this week" />
      <StatCard icon={CalendarDays} label="Events" value={stats?.eventsCount ?? "—"} hint="On your calendar" />
      <StatCard icon={ListChecks} label="Habit goals met" value={stats?.habitGoalsMet ?? "—"} hint="Habit-days this week" />
      <StatCard icon={Flag} label="Milestones" value={stats?.milestonesHit ?? "—"} hint="Reached this week" />
    </div>
  )
}
