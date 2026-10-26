import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar"
import { HabitTrackerCell } from "@/components/habits/habit-tracker-cell"
import { DataState } from "@/components/shared/data-state"
import { useHabitLogs } from "@/hooks/queries/use-habits"
import { formatDate, fromDayKey, startOfWeek, toDayKey } from "@/lib/dates"
import { habitDay, habitUnit, weekDays } from "@/lib/habits"
import { cn } from "@/lib/utils"
import type { HabitWeekTrackerProps } from "@/types/habit"

export function HabitWeekTracker({ habits, onEditDay }: HabitWeekTrackerProps) {
  const { t } = useTranslation()
  const [weekStart, setWeekStart] = useState(() => startOfWeek())
  const days = weekDays(weekStart)
  const today = toDayKey()
  const logs = useHabitLogs({ from: days[0], to: days[6] })
  const items = logs.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-base font-semibold">{t("habits.weekTracker")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("habits.weekTrackerDescription")}</p></div>
        <CalendarToolbar weekStart={weekStart} onChange={setWeekStart} nextDisabled={days[6] >= today} />
      </div>
      <DataState isLoading={logs.isLoading} error={logs.error}>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{t("habits.weekTrackerDescription")}</caption>
            <thead className="bg-card">
              <tr>
                <th scope="col" className="min-w-36 border-b px-4 py-3 font-medium">{t("habits.habit")}</th>
                {days.map((day) => (
                  <th key={day} scope="col" className={cn("border-b px-1.5 py-3 text-center font-medium", day === today && "text-primary")}>
                    <span className="block capitalize">{formatDate(fromDayKey(day), { weekday: "short" })}</span>
                    <span className="block text-sm tabular-nums">{fromDayKey(day).getDate()}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {habits.map((habit) => (
                <tr key={habit.id} className="border-b last:border-b-0">
                  <th scope="row" className="px-4 py-2 font-normal">
                    <span className="block max-w-48 truncate text-sm font-medium"><span className="mr-1.5" aria-hidden="true">{habit.emoji}</span>{habit.name}</span>
                    <span className="block text-muted-foreground">{t("habits.goalShort", { target: habit.target, unit: habitUnit(habit.unit) })}</span>
                  </th>
                  {days.map((day) => (
                    <td key={day} className="px-1.5 py-2"><HabitTrackerCell habit={habit} entry={habitDay(habit, items, day)} onEditDay={onEditDay} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>
    </div>
  )
}
