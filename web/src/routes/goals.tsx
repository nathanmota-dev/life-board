import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Plus, Target } from "lucide-react"
import { GoalDetailSheet } from "@/components/goals/goal-detail-sheet"
import { GoalFormDialog } from "@/components/goals/goal-form-dialog"
import { GoalGrid } from "@/components/goals/goal-grid"
import { GoalStats } from "@/components/goals/goal-stats"
import { GoalTimeline } from "@/components/goals/goal-timeline"
import { GoalsToolbar } from "@/components/goals/goals-toolbar"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Page, PageSection } from "@/components/workspace-ui"
import { useGoals } from "@/hooks/queries/use-goals"
import { readGoalLayout, saveGoalLayout } from "@/lib/goals"
import type { Goal, GoalDialogState, GoalDomainFilter, GoalLayout, GoalView } from "@/types/goal"

export function GoalsPage() {
  const { t } = useTranslation()
  const [view, setView] = useState<GoalView>("all")
  const [domain, setDomain] = useState<GoalDomainFilter>("all")
  const [layout, setLayout] = useState<GoalLayout>(readGoalLayout)
  const [grouped, setGrouped] = useState(false)
  const [openGoalId, setOpenGoalId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<GoalDialogState>({ open: false, goal: null })
  const goals = useGoals()
  const items = goals.data ?? []
  const visible = items.filter((goal) => (view === "all" || goal.status === view) && (domain === "all" || goal.domain === domain))
  const changeLayout = (next: GoalLayout) => {
    setLayout(next)
    saveGoalLayout(next)
  }
  const open = (goal: Goal) => setOpenGoalId(goal.id)

  return (
    <Page
      title={t("navigation.goals")}
      description={t("goals.description")}
      actions={
        <Button size="sm" onClick={() => setDialog({ open: true, goal: null })}>
          <Plus />
          {t("goals.newGoal")}
        </Button>
      }
      toolbar={
        <GoalsToolbar
          goals={items}
          view={view}
          onViewChange={setView}
          domain={domain}
          onDomainChange={setDomain}
          layout={layout}
          onLayoutChange={changeLayout}
          grouped={grouped}
          onGroupedChange={setGrouped}
        />
      }
    >
      <PageSection>
        <GoalStats goals={items} />
      </PageSection>
      <PageSection title={t("navigation.goals")}>
        <DataState
          isLoading={goals.isLoading}
          error={goals.error}
          isEmpty={visible.length === 0}
          empty={<EmptyState icon={Target} title={t("goals.empty")} description={t("goals.emptyDescription")} />}
        >
          {layout === "timeline" ? <GoalTimeline goals={visible} onOpen={open} /> : <GoalGrid goals={visible} grouped={grouped} onOpen={open} />}
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
