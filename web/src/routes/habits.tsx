import { useTranslation } from "react-i18next"
import { useState } from "react"
import { ListChecks, Plus } from "lucide-react"
import { HabitDayDialog } from "@/components/habits/habit-day-dialog"
import { HabitFormDialog } from "@/components/habits/habit-form-dialog"
import { HabitAnalytics } from "@/components/habits/habit-analytics"
import { HabitList } from "@/components/habits/habit-list"
import { HabitStats } from "@/components/habits/habit-stats"
import { HabitWeekTracker } from "@/components/habits/habit-week-tracker"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { Button } from "@/components/ui/button"
import { Page, PageSection } from "@/components/workspace-ui"
import { useHabitLogs, useHabits } from "@/hooks/queries/use-habits"
import { formatDate, lastDays, toDayKey } from "@/lib/dates"
import type { Habit, HabitDayEdit, HabitDialogState, HabitFilter } from "@/types/habit"

export function HabitsPage() {
  const { t } = useTranslation()
  const habits = useHabits()
  const logs = useHabitLogs({ from: lastDays(7)[0], to: toDayKey() })
  const [dialog, setDialog] = useState<HabitDialogState>({ open: false, habit: null })
  const [filter, setFilter] = useState<HabitFilter>("all")
  const [dayEdit, setDayEdit] = useState<HabitDayEdit | null>(null)
  const openDialog = (habit: Habit | null) => setDialog({ open: true, habit })
  const items = habits.data ?? []
  const logItems = logs.data ?? []
  const done = items.filter((habit) => habit.doneToday).length
  const visible = items.filter((habit) => filter === "all" || habit.doneToday === (filter === "done"))

  return (
    <Page title={t("navigation.habits")} description={t("habits.description")}
      actions={<Button size="sm" onClick={() => openDialog(null)}><Plus />{t("habits.newHabit")}</Button>}>
      <DataState isLoading={habits.isLoading || logs.isLoading} error={habits.error ?? logs.error} isEmpty={items.length === 0}
        empty={<PageSection><EmptyState icon={ListChecks} title={t("habits.empty")} description={t("habits.emptyDescription")}
          action={<Button size="sm" onClick={() => openDialog(null)}>{t("habits.addFirst")}</Button>} /></PageSection>}>
        <PageSection><HabitStats habits={items} logs={logItems} /></PageSection>
        <PageSection>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-base font-semibold">{t("habits.todayHabits")}</h2><p className="mt-1 text-sm text-muted-foreground">{formatDate(new Date(), { weekday: "long", day: "numeric", month: "long" })}</p></div>
            <SegmentedControl<HabitFilter> label={t("habits.todayHabits")} value={filter} onChange={setFilter} options={[
              { value: "all", label: t("habits.all"), count: items.length },
              { value: "pending", label: t("habits.pending"), count: items.length - done },
              { value: "done", label: t("habits.completed"), count: done },
            ]} />
          </div>
          <DataState isLoading={false} error={null} isEmpty={!visible.length} empty={<p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("habits.noMatches")}</p>}>
            <HabitList habits={visible} logs={logItems} onEdit={openDialog} onEditDay={setDayEdit} />
          </DataState>
        </PageSection>
        <PageSection><HabitWeekTracker habits={items} onEditDay={setDayEdit} /></PageSection>
        <PageSection><HabitAnalytics habits={items} /></PageSection>
      </DataState>
      <HabitFormDialog key={`${dialog.habit?.id ?? "new"}-${dialog.open}`} open={dialog.open} habit={dialog.habit}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))} />
      {dayEdit ? <HabitDayDialog key={`${dayEdit.habit.id}-${dayEdit.entry.day}`} edit={dayEdit} onClose={() => setDayEdit(null)} /> : null}
    </Page>
  )
}
