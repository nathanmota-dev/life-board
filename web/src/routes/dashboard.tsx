import { useTranslation } from "react-i18next"
import { LayoutGrid } from "lucide-react"
import { DashboardCustomizeMenu } from "@/components/dashboard/dashboard-customize-menu"
import { DashboardStats } from "@/components/dashboard/dashboard-stats"
import { DashboardWidget } from "@/components/dashboard/dashboard-widget"
import { GithubActivityPanel } from "@/components/dashboard/github-activity-panel"
import { QuickCapture } from "@/components/inbox/quick-capture"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Page, PageSection } from "@/components/workspace-ui"
import { useCalendarEvents } from "@/hooks/queries/use-calendar"
import { useHabits } from "@/hooks/queries/use-habits"
import { useMoodToday } from "@/hooks/queries/use-mood"
import { useTasks } from "@/hooks/queries/use-tasks"
import { useDashboardLayout } from "@/hooks/use-dashboard-layout"
import { greeting, isAloneOnRow, tasksForToday, upcomingRange, visibleWidgets } from "@/lib/dashboard"
import { formatDate } from "@/lib/dates"

/** "My day": the optional quick capture, the fixed stat strip and GitHub panel, and the widgets the user chose, in their order. */
export function Dashboard() {
  const { t } = useTranslation()
  const tasks = useTasks({ limit: 100 })
  const habits = useHabits()
  const events = useCalendarEvents(upcomingRange())
  const mood = useMoodToday()
  const { layout, toggle, move, toggleQuickCapture, reset } = useDashboardLayout()
  const widgets = visibleWidgets(layout)

  return (
    <Page
      title={t("navigation.dashboard")}
      description={`${greeting()} — ${formatDate(new Date(), { weekday: "long", month: "long", day: "numeric" })}`}
      actions={
        <DashboardCustomizeMenu layout={layout} onToggle={toggle} onMove={move} onToggleQuickCapture={toggleQuickCapture} onReset={reset} />
      }
    >
      {layout.quickCapture ? (
        <PageSection>
          <QuickCapture />
        </PageSection>
      ) : null}
      <PageSection>
        <DashboardStats tasksToday={tasksForToday(tasks.data ?? [])} habits={habits.data ?? []} events={events.data ?? []} mood={mood.data} />
      </PageSection>
      <PageSection>
        <GithubActivityPanel />
      </PageSection>
      <PageSection>
        <DataState
          isLoading={false}
          error={null}
          isEmpty={widgets.length === 0}
          empty={
            <EmptyState
              icon={LayoutGrid}
              title={t("dashboard.allHidden")}
              description={t("dashboard.allHiddenDescription")}
              action={<Button size="sm" variant="outline" onClick={reset}>{t("dashboard.resetLayout")}</Button>}
            />
          }
        >
          <div className="grid gap-4 xl:grid-cols-2">
            {widgets.map((id, index) => (
              <DashboardWidget key={id} id={id} fullRow={isAloneOnRow(index, widgets.length)} />
            ))}
          </div>
        </DataState>
      </PageSection>
    </Page>
  )
}
