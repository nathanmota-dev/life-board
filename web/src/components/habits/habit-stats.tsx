import { CalendarCheck, Flame, ListChecks, Percent } from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"
import { completionRate } from "@/lib/habits"
import type { HabitStatsProps } from "@/types/habit"

export function HabitStats({ habits, logs }: HabitStatsProps) {
  const doneToday = habits.filter((habit) => habit.doneToday).length
  const bestStreak = Math.max(0, ...habits.map((habit) => habit.streak))

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={ListChecks} label="Tracked habits" value={habits.length} hint="Active daily goals" />
      <StatCard icon={CalendarCheck} label="Done today" value={`${doneToday} of ${habits.length}`} hint="Goals met so far" />
      <StatCard icon={Flame} label="Best streak" value={`${bestStreak} days`} hint="Longest current run" />
      <StatCard icon={Percent} label="Last 7 days" value={`${completionRate(habits, logs)}%`} hint="Of daily goals met" />
    </div>
  )
}
