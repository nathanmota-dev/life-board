import { useTranslation } from "react-i18next"
import { Link } from "@tanstack/react-router"
import { ArrowUpRight, ListChecks } from "lucide-react"
import { DashboardHabitRow } from "@/components/dashboard/dashboard-habit-row"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/workspace-ui"
import { useHabits } from "@/hooks/queries/use-habits"
import { sortHabitsForDay } from "@/lib/dashboard"

/** Today's habits, the ones still to do first. */
export function DashboardHabits() {
  const { t } = useTranslation()
  const habits = useHabits()
  const items = sortHabitsForDay(habits.data ?? [])

  return (
    <Panel
      title={t("dashboard.widgets.habits")}
      icon={ListChecks}
      action={
        <Button variant="outline" size="icon-sm" aria-label={t("dashboard.openHabits")} asChild>
          <Link to="/habits">
            <ArrowUpRight />
          </Link>
        </Button>
      }
    >
      <DataState
        isLoading={habits.isLoading}
        error={habits.error}
        isEmpty={items.length === 0}
        empty={<EmptyState icon={ListChecks} title={t("habits.empty")} className="py-6" />}
      >
        <ul className="flex flex-col divide-y">
          {items.map((habit) => (
            <DashboardHabitRow key={habit.id} habit={habit} />
          ))}
        </ul>
      </DataState>
    </Panel>
  )
}
