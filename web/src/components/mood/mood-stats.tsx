import { useTranslation } from "react-i18next"
import { CalendarDays, NotebookPen, Smile, TrendingUp } from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"
import { averageMood, moodOption } from "@/lib/mood"
import type { MoodStatsProps } from "@/types/mood"

export function MoodStats({ entries, today }: MoodStatsProps) {
  const { t } = useTranslation()
  const todayEntry = today?.entry
  const week = averageMood(entries, 7)
  const month = averageMood(entries, 30)

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={Smile}
        label={t("common.today")}
        value={todayEntry ? `${moodOption(todayEntry.score).emoji} ${moodOption(todayEntry.score).label}` : t("dashboard.notLogged")}
        hint={t("mood.todayCheckIn")}
      />
      <StatCard icon={TrendingUp} label={t("common.last7Days")} value={week ?? "—"} hint={t("mood.averageScore")} />
      <StatCard icon={CalendarDays} label={t("common.last30Days")} value={month ?? "—"} hint={t("mood.averageScore")} />
      <StatCard icon={NotebookPen} label={t("mood.entries")} value={entries.length} hint={t("mood.daysCheckedIn")} />
    </div>
  )
}
