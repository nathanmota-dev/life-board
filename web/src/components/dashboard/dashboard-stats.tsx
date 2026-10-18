import { CalendarDays, ListChecks, ListTodo, Smile } from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"
import { pluralize } from "@/lib/format"
import { moodOption } from "@/lib/mood"
import type { DashboardStatsProps } from "@/types/dashboard"

export function DashboardStats({ tasksToday, habits, events, mood }: DashboardStatsProps) {
  const habitsDone = habits.filter((habit) => habit.doneToday).length
  const entry = mood?.entry

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={ListTodo} label="Tasks for today" value={pluralize(tasksToday.length, "task")} hint="Planned, due or overdue" />
      <StatCard icon={ListChecks} label="Habits" value={`${habitsDone} of ${habits.length} done`} hint="Daily goals met today" />
      <StatCard icon={CalendarDays} label="Next 7 days" value={pluralize(events.length, "event")} hint="On your calendar" />
      <StatCard
        icon={Smile}
        label="Mood"
        value={entry ? `${moodOption(entry.score).emoji} ${moodOption(entry.score).label}` : "Not logged"}
        hint={entry ? "Checked in today" : "How are you feeling?"}
      />
    </div>
  )
}
