import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Plus } from "lucide-react"
import { GoalMilestoneRow } from "@/components/goals/goal-milestone-row"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAddMilestone } from "@/hooks/queries/use-goals"
import { fromDateInput } from "@/lib/dates"
import type { GoalMilestonesProps } from "@/types/goal"

export function GoalMilestones({ goal, milestones }: GoalMilestonesProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState("")
  const [dueAt, setDueAt] = useState("")
  const add = useAddMilestone()

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y rounded-xl border">
        {milestones.map((milestone) => (
          <GoalMilestoneRow key={milestone.id} goal={goal} milestone={milestone} />
        ))}
        {milestones.length === 0 ? <li className="px-3 py-3 text-sm text-muted-foreground">{t("goals.noMilestones")}</li> : null}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (title.trim()) {
            add.mutate(
              { goalId: goal.id, input: { title: title.trim(), dueAt: fromDateInput(dueAt) } },
              { onSuccess: () => { setTitle(""); setDueAt("") } },
            )
          }
        }}
      >
        <Input aria-label={t("goals.newMilestone")} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("goals.addMilestone")} className="h-8 min-w-40 flex-1" />
        <Input type="date" aria-label={t("goals.newMilestoneDue")} value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="h-8 w-auto" />
        <Button type="submit" size="sm" variant="outline" disabled={!title.trim() || add.isPending}>
          <Plus />
          {t("common.add")}
        </Button>
      </form>
    </div>
  )
}
