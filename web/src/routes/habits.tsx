import { useState } from "react"
import { ListChecks, Plus } from "lucide-react"
import { HabitFormDialog } from "@/components/habits/habit-form-dialog"
import { HabitHistoryChart } from "@/components/habits/habit-history-chart"
import { HabitList } from "@/components/habits/habit-list"
import { HabitStats } from "@/components/habits/habit-stats"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Page, PageSection, Panel } from "@/components/workspace-ui"
import { useHabitLogs, useHabits } from "@/hooks/queries/use-habits"
import { lastDays } from "@/lib/dates"
import type { Habit, HabitDialogState } from "@/types/habit"

const HISTORY_DAYS = lastDays(14)

export function HabitsPage() {
  const habits = useHabits()
  const logs = useHabitLogs({ from: HISTORY_DAYS[0] })
  const [dialog, setDialog] = useState<HabitDialogState>({ open: false, habit: null })
  const openDialog = (habit: Habit | null) => setDialog({ open: true, habit })
  const items = habits.data ?? []
  const logItems = logs.data ?? []

  return (
    <Page
      title="Habits"
      description="Daily goals you check off as you go."
      actions={
        <Button size="sm" onClick={() => openDialog(null)}>
          <Plus />
          New habit
        </Button>
      }
    >
      <DataState
        isLoading={habits.isLoading}
        error={habits.error}
        isEmpty={items.length === 0}
        empty={
          <PageSection>
            <EmptyState
              icon={ListChecks}
              title="No habits yet"
              description="Track water, workouts, reading or anything you want to do every day."
              action={<Button size="sm" onClick={() => openDialog(null)}>Add your first habit</Button>}
            />
          </PageSection>
        }
      >
        <PageSection>
          <HabitStats habits={items} logs={logItems} />
        </PageSection>
        <PageSection title="Today">
          <HabitList habits={items} logs={logItems} onEdit={openDialog} />
        </PageSection>
        <PageSection>
          <Panel title="Goals met, last 14 days">
            <HabitHistoryChart habits={items} logs={logItems} />
          </Panel>
        </PageSection>
      </DataState>
      <HabitFormDialog
        key={`${dialog.habit?.id ?? "new"}-${dialog.open}`}
        open={dialog.open}
        habit={dialog.habit}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </Page>
  )
}
