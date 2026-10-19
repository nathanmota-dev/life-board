import { useTranslation } from "react-i18next"
import { Link } from "@tanstack/react-router"
import { ArrowUpRight, Target } from "lucide-react"
import { GoalsProgressList } from "@/components/dashboard/goals-progress-list"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/workspace-ui"
import { useGoals } from "@/hooks/queries/use-goals"

export function DashboardGoals() {
  const { t } = useTranslation()
  const goals = useGoals()
  const active = (goals.data ?? []).filter((goal) => goal.status === "active").slice(0, 5)

  return (
    <Panel
      title={t("dashboard.widgets.goals")}
      icon={Target}
      action={
        <Button variant="outline" size="icon-sm" aria-label={t("dashboard.openGoals")} asChild>
          <Link to="/goals">
            <ArrowUpRight />
          </Link>
        </Button>
      }
    >
      <DataState
        isLoading={goals.isLoading}
        error={goals.error}
        isEmpty={active.length === 0}
        empty={<EmptyState icon={Target} title={t("dashboard.noActiveGoals")} className="py-6" />}
      >
        <GoalsProgressList goals={active} />
      </DataState>
    </Panel>
  )
}
