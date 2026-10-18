import { CalendarDays, NotebookPen, Smile, TrendingUp } from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"
import { averageMood, moodOption } from "@/lib/mood"
import type { MoodStatsProps } from "@/types/mood"

export function MoodStats({ entries, today }: MoodStatsProps) {
  const todayEntry = today?.entry
  const week = averageMood(entries, 7)
  const month = averageMood(entries, 30)

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={Smile}
        label="Today"
        value={todayEntry ? `${moodOption(todayEntry.score).emoji} ${moodOption(todayEntry.score).label}` : "Not logged"}
        hint="Your check-in for today"
      />
      <StatCard icon={TrendingUp} label="Last 7 days" value={week ?? "—"} hint="Average score out of 5" />
      <StatCard icon={CalendarDays} label="Last 30 days" value={month ?? "—"} hint="Average score out of 5" />
      <StatCard icon={NotebookPen} label="Entries" value={entries.length} hint="Days you checked in" />
    </div>
  )
}
