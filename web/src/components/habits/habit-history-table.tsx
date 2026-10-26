import { Check, Circle, Minus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { formatDate, fromDayKey } from "@/lib/dates"
import { habitDay, habitDayStatus, habitUnit } from "@/lib/habits"
import { cn } from "@/lib/utils"
import type { HabitHistoryTableProps } from "@/types/habit"

export function HabitHistoryTable({ habits, logs, days }: HabitHistoryTableProps) {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">{t("habits.historyDescription")}</caption>
        <thead className="bg-card">
          <tr><th scope="col" className="min-w-36 border-b px-4 py-3 font-medium">{t("habits.date")}</th>
            {habits.map((habit) => <th key={habit.id} scope="col" className="min-w-32 border-b px-3 py-3 font-medium"><span className="mr-1.5">{habit.emoji}</span>{habit.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {[...days].reverse().map((day) => (
            <tr key={day} className="border-b last:border-b-0 hover:bg-muted/30">
              <th scope="row" className="whitespace-nowrap px-4 py-3 font-normal">{formatDate(fromDayKey(day), { day: "numeric", month: "short", weekday: "short" })}</th>
              {habits.map((habit) => {
                const entry = habitDay(habit, logs, day)
                const status = habitDayStatus(entry)
                const description = `${t(`habits.${status}`)} · ${entry.count} / ${entry.target} ${habitUnit(habit.unit)}`
                return <td key={habit.id} className="px-3 py-2" title={description}>
                  <span className={cn("inline-flex items-center gap-2 rounded-md px-2 py-1.5 tabular-nums", entry.done ? "bg-primary/12 text-primary" : entry.count > 0 ? "bg-chart-3/15 text-foreground" : "text-muted-foreground")}>
                    {entry.done ? <Check className="size-3.5" /> : entry.count > 0 ? <Circle className="size-3.5" /> : <Minus className="size-3.5" />}
                    <span className="sr-only">{t(`habits.${status}`)}: </span>{entry.eligible ? `${entry.count} / ${entry.target}` : "—"}
                  </span>
                </td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
