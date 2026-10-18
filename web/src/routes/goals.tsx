import { useState } from "react"
import { Plus, Target } from "lucide-react"
import { GoalDetailSheet } from "@/components/goals/goal-detail-sheet"
import { GoalFormDialog } from "@/components/goals/goal-form-dialog"
import { GoalGrid } from "@/components/goals/goal-grid"
import { GoalStats } from "@/components/goals/goal-stats"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { Button } from "@/components/ui/button"
import { Page, PageSection } from "@/components/workspace-ui"
import { useGoals } from "@/hooks/queries/use-goals"
import { countGoals, GOAL_STATUS_OPTIONS } from "@/lib/goals"
import type { GoalDialogState, GoalView } from "@/types/goal"

export function GoalsPage() {
  const [view, setView] = useState<GoalView>("all")
  const [openGoalId, setOpenGoalId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<GoalDialogState>({ open: false, goal: null })
  const goals = useGoals()
  const items = goals.data ?? []
  const counts = countGoals(items)
  const visible = view === "all" ? items : items.filter((goal) => goal.status === view)

  return (
    <Page
      title="Goals"
      description="Short and long-term goals, broken into milestones."
      actions={
        <Button size="sm" onClick={() => setDialog({ open: true, goal: null })}>
          <Plus />
          New goal
        </Button>
      }
      toolbar={
        <SegmentedControl
          label="Goal views"
          value={view}
          onChange={setView}
          options={[{ value: "all", label: "All", count: items.length }, ...GOAL_STATUS_OPTIONS.map((option) => ({ ...option, count: counts[option.value] }))]}
        />
      }
    >
      <PageSection>
        <GoalStats goals={items} />
      </PageSection>
      <PageSection title="Goals">
        <DataState
          isLoading={goals.isLoading}
          error={goals.error}
          isEmpty={visible.length === 0}
          empty={<EmptyState icon={Target} title="No goals here" description="Set a goal and break it into milestones." />}
        >
          <GoalGrid goals={visible} onOpen={(goal) => setOpenGoalId(goal.id)} />
        </DataState>
      </PageSection>
      <GoalDetailSheet goalId={openGoalId} onClose={() => setOpenGoalId(null)} onEdit={(goal) => setDialog({ open: true, goal })} />
      <GoalFormDialog
        key={`${dialog.goal?.id ?? "new"}-${dialog.open}`}
        open={dialog.open}
        goal={dialog.goal}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </Page>
  )
}
