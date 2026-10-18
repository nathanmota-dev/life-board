import { CircleCheck, Gauge, Target } from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"
import { countGoals } from "@/lib/goals"
import type { GoalStatsProps } from "@/types/goal"

export function GoalStats({ goals }: GoalStatsProps) {
  const counts = countGoals(goals)
  const active = goals.filter((goal) => goal.status === "active")
  const average = active.length ? Math.round(active.reduce((sum, goal) => sum + goal.progress, 0) / active.length) : 0

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard icon={Target} label="Active goals" value={counts.active} hint={`${counts.paused} paused`} />
      <StatCard icon={Gauge} label="Average progress" value={`${average}%`} hint="Across active goals" />
      <StatCard icon={CircleCheck} label="Completed" value={counts.completed} hint="Goals you finished" />
    </div>
  )
}
