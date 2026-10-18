import { CalendarDays, ListChecks, ListTodo, Target } from "lucide-react"
import { DashboardStats } from "@/components/dashboard/dashboard-stats"
import { GithubActivityPanel } from "@/components/dashboard/github-activity-panel"
import { GoalsProgressList } from "@/components/dashboard/goals-progress-list"
import { HabitsTodayList } from "@/components/dashboard/habits-today-list"
import { TodayTasksList } from "@/components/dashboard/today-tasks-list"
import { UpcomingEventsList } from "@/components/dashboard/upcoming-events-list"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Page, PageSection, Panel } from "@/components/workspace-ui"
import { useCalendarEvents } from "@/hooks/queries/use-calendar"
import { useGoals } from "@/hooks/queries/use-goals"
import { useHabits } from "@/hooks/queries/use-habits"
import { useMoodToday } from "@/hooks/queries/use-mood"
import { useTasks } from "@/hooks/queries/use-tasks"
import { greeting, nextEvents, tasksForToday, upcomingRange } from "@/lib/dashboard"
import { formatDate } from "@/lib/dates"

export function Dashboard() {
  const tasks = useTasks({ limit: 100 })
  const habits = useHabits()
  const events = useCalendarEvents(upcomingRange())
  const goals = useGoals()
  const mood = useMoodToday()
  const today = tasksForToday(tasks.data ?? [])
  const upcoming = nextEvents(events.data ?? [])
  const activeGoals = (goals.data ?? []).filter((goal) => goal.status === "active").slice(0, 5)

  return (
    <Page title="Dashboard" description={`${greeting()} — ${formatDate(new Date(), { weekday: "long", month: "long", day: "numeric" })}`}>
      <PageSection>
        <DashboardStats tasksToday={today} habits={habits.data ?? []} events={events.data ?? []} mood={mood.data} />
      </PageSection>
      <PageSection>
        <GithubActivityPanel />
      </PageSection>
      <PageSection>
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Today's tasks" icon={ListTodo}>
            <DataState isLoading={tasks.isLoading} error={tasks.error} isEmpty={today.length === 0} empty={<EmptyState icon={ListTodo} title="Nothing planned for today" className="py-6" />}>
              <TodayTasksList tasks={today} />
            </DataState>
          </Panel>
          <Panel title="Upcoming events" icon={CalendarDays}>
            <DataState isLoading={events.isLoading} error={events.error} isEmpty={upcoming.length === 0} empty={<EmptyState icon={CalendarDays} title="No events this week" className="py-6" />}>
              <UpcomingEventsList events={upcoming} />
            </DataState>
          </Panel>
          <Panel title="Habits today" icon={ListChecks}>
            <DataState
              isLoading={habits.isLoading}
              error={habits.error}
              isEmpty={(habits.data ?? []).length === 0}
              empty={<EmptyState icon={ListChecks} title="No habits yet" className="py-6" />}
            >
              <HabitsTodayList habits={habits.data ?? []} />
            </DataState>
          </Panel>
          <Panel title="Active goals" icon={Target}>
            <DataState isLoading={goals.isLoading} error={goals.error} isEmpty={activeGoals.length === 0} empty={<EmptyState icon={Target} title="No active goals" className="py-6" />}>
              <GoalsProgressList goals={activeGoals} />
            </DataState>
          </Panel>
        </div>
      </PageSection>
    </Page>
  )
}
