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
  const stats = useWeekStats()
  const tasks = useTasks({ limit: 100 })
  const thoughts = useThoughts({ limit: 50 })
  const mood = useMoodEntries(30)
  const goals = useGoals()
  const queries = [tasks, thoughts, mood, goals]
  const days = buildActivity({ tasks: tasks.data ?? [], thoughts: thoughts.data ?? [], mood: mood.data ?? [], goals: goals.data ?? [] })

  return (
    <Page title="Activity" description="What you've been up to lately.">
      <PageSection>
        <WeekStatsGrid stats={stats.data} />
      </PageSection>
      <PageSection>
        <Panel title="Recent activity" icon={Activity} className="max-w-3xl">
          <DataState
            isLoading={queries.some((query) => query.isLoading)}
            error={queries.find((query) => query.error)?.error ?? null}
            isEmpty={days.length === 0}
            empty={<EmptyState icon={Activity} title="Nothing yet" description="Tasks, thoughts, goals and mood check-ins show up here." />}
          >
            <ActivityTimeline days={days} />
          </DataState>
        </Panel>
      </PageSection>
    </Page>
  )
}
