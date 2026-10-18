import { useTranslation } from "react-i18next"
import { CalendarCheck, Flame, ListChecks, Percent } from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"
import { completionRate } from "@/lib/habits"
import type { HabitStatsProps } from "@/types/habit"

export function HabitStats({ habits, logs }: HabitStatsProps) {
  const { t } = useTranslation()
  const doneToday = habits.filter((habit) => habit.doneToday).length
  const bestStreak = Math.max(0, ...habits.map((habit) => habit.streak))

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={ListChecks} label={t("habits.tracked")} value={habits.length} hint={t("habits.activeDailyGoals")} />
      <StatCard icon={CalendarCheck} label={t("habits.doneToday")} value={t("common.ofTotal", { count: doneToday, total: habits.length })} hint={t("habits.goalsMetSoFar")} />
      <StatCard icon={Flame} label={t("habits.bestStreak")} value={t("counts.day", { count: bestStreak })} hint={t("habits.longestRun")} />
      <StatCard icon={Percent} label={t("common.last7Days")} value={`${completionRate(habits, logs)}%`} hint={t("habits.dailyGoalsMet")} />
    </div>
  )
}
