import { useTranslation } from "react-i18next"
import { CircleCheck, Gauge, Target } from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"
import { countGoals } from "@/lib/goals"
import type { GoalStatsProps } from "@/types/goal"

export function GoalStats({ goals }: GoalStatsProps) {
  const { t } = useTranslation()
  const counts = countGoals(goals)
  const active = goals.filter((goal) => goal.status === "active")
  const average = active.length ? Math.round(active.reduce((sum, goal) => sum + goal.progress, 0) / active.length) : 0

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard icon={Target} label={t("goals.active")} value={counts.active} hint={t("goals.pausedCount", { count: counts.paused })} />
      <StatCard icon={Gauge} label={t("goals.averageProgress")} value={`${average}%`} hint={t("goals.acrossActiveGoals")} />
      <StatCard icon={CircleCheck} label={t("goals.completed")} value={counts.completed} hint={t("goals.finished")} />
    </div>
  )
}
