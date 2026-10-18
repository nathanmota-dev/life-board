import { useTranslation } from "react-i18next"
import { CalendarDays, CircleCheck, Flag, Lightbulb, ListChecks } from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"
import type { WeekStatsGridProps } from "@/types/activity"

export function WeekStatsGrid({ stats }: WeekStatsGridProps) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard icon={CircleCheck} label={t("activity.tasksCompleted")} value={stats?.tasksCompleted ?? "—"} hint={t("common.thisWeek")} />
      <StatCard icon={Lightbulb} label={t("navigation.thoughts")} value={stats?.thoughtsCreated ?? "—"} hint={t("activity.capturedThisWeek")} />
      <StatCard icon={CalendarDays} label={t("activity.events")} value={stats?.eventsCount ?? "—"} hint={t("activity.onCalendar")} />
      <StatCard icon={ListChecks} label={t("activity.habitGoalsMet")} value={stats?.habitGoalsMet ?? "—"} hint={t("activity.habitDays")} />
      <StatCard icon={Flag} label={t("goals.milestones")} value={stats?.milestonesHit ?? "—"} hint={t("activity.reachedThisWeek")} />
    </div>
  )
}
