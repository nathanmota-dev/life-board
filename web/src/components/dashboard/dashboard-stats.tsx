import { useTranslation } from "react-i18next"
import { CalendarDays, ListChecks, ListTodo, Smile } from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"
import { moodOption } from "@/lib/mood"
import type { DashboardStatsProps } from "@/types/dashboard"

export function DashboardStats({ tasksToday, habits, events, mood }: DashboardStatsProps) {
  const { t } = useTranslation()
  const habitsDone = habits.filter((habit) => habit.doneToday).length
  const entry = mood?.entry

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={ListTodo} label={t("dashboard.tasksForToday")} value={t("counts.task", { count: tasksToday.length })} hint={t("dashboard.plannedOrDue")} />
      <StatCard icon={ListChecks} label={t("navigation.habits")} value={t("habits.completedOf", { count: habitsDone, total: habits.length })} hint={t("dashboard.dailyGoalsMet")} />
      <StatCard icon={CalendarDays} label={t("dashboard.next7Days")} value={t("counts.event", { count: events.length })} hint={t("activity.onCalendar")} />
      <StatCard
        icon={Smile}
        label={t("navigation.mood")}
        value={entry ? `${moodOption(entry.score).emoji} ${moodOption(entry.score).label}` : t("dashboard.notLogged")}
        hint={entry ? t("dashboard.checkedIn") : t("dashboard.howFeeling")}
      />
    </div>
  )
}
