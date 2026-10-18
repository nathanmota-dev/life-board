import { useTranslation } from "react-i18next"
import { Activity } from "lucide-react"
import { ActivityTimeline } from "@/components/activity/activity-timeline"
import { WeekStatsGrid } from "@/components/activity/week-stats-grid"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Page, PageSection, Panel } from "@/components/workspace-ui"
import { useGoals } from "@/hooks/queries/use-goals"
import { useMoodEntries } from "@/hooks/queries/use-mood"
import { useWeekStats } from "@/hooks/queries/use-stats"
import { useTasks } from "@/hooks/queries/use-tasks"
import { useThoughts } from "@/hooks/queries/use-thoughts"
import { buildActivity } from "@/lib/activity"

export function ActivityPage() {
  const { t } = useTranslation()
  const stats = useWeekStats()
  const tasks = useTasks({ limit: 100 })
  const thoughts = useThoughts({ limit: 50 })
  const mood = useMoodEntries(30)
  const goals = useGoals()
  const queries = [tasks, thoughts, mood, goals]
  const days = buildActivity({ tasks: tasks.data ?? [], thoughts: thoughts.data ?? [], mood: mood.data ?? [], goals: goals.data ?? [] })

  return (
    <Page title={t("navigation.activity")} description={t("activity.description")}>
      <PageSection>
        <WeekStatsGrid stats={stats.data} />
      </PageSection>
      <PageSection>
        <Panel title={t("activity.recent")} icon={Activity} className="max-w-3xl">
          <DataState
            isLoading={queries.some((query) => query.isLoading)}
            error={queries.find((query) => query.error)?.error ?? null}
            isEmpty={days.length === 0}
            empty={<EmptyState icon={Activity} title={t("activity.empty")} description={t("activity.emptyDescription")} />}
          >
            <ActivityTimeline days={days} />
          </DataState>
        </Panel>
      </PageSection>
    </Page>
  )
}
