import { useTranslation } from "react-i18next"
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
  const { t } = useTranslation()
  const habits = useHabits()
  const logs = useHabitLogs({ from: HISTORY_DAYS[0] })
  const [dialog, setDialog] = useState<HabitDialogState>({ open: false, habit: null })
  const openDialog = (habit: Habit | null) => setDialog({ open: true, habit })
  const items = habits.data ?? []
  const logItems = logs.data ?? []

  return (
    <Page
      title={t("navigation.habits")}
      description={t("habits.description")}
      actions={
        <Button size="sm" onClick={() => openDialog(null)}>
          <Plus />
          {t("habits.newHabit")}
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
              title={t("habits.empty")}
              description={t("habits.emptyDescription")}
              action={<Button size="sm" onClick={() => openDialog(null)}>{t("habits.addFirst")}</Button>}
            />
          </PageSection>
        }
      >
        <PageSection>
          <HabitStats habits={items} logs={logItems} />
        </PageSection>
        <PageSection title={t("common.today")}>
          <HabitList habits={items} logs={logItems} onEdit={openDialog} />
        </PageSection>
        <PageSection>
          <Panel title={t("habits.last14Days")}>
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
