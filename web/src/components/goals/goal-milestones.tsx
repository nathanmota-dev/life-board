import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useAddMilestone, useRemoveMilestone, useUpdateGoal, useUpdateMilestone } from "@/hooks/queries/use-goals"
import { milestoneProgress } from "@/lib/goals"
import { cn } from "@/lib/utils"
import type { GoalMilestonesProps, Milestone } from "@/types/goal"

export function GoalMilestones({ goal, milestones }: GoalMilestonesProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState("")
  const add = useAddMilestone()
  const update = useUpdateMilestone()
  const remove = useRemoveMilestone()
  const updateGoal = useUpdateGoal()

  // Goal progress follows the share of milestones that are done.
  const syncProgress = (next: Milestone[]) =>
    updateGoal.mutate({ id: goal.id, input: { progress: milestoneProgress(next) } })

  const toggle = (milestone: Milestone, done: boolean) => {
    const completedAt = done ? new Date().toISOString() : null
    update.mutate(
      { goalId: goal.id, milestoneId: milestone.id, input: { completedAt } },
      { onSuccess: () => syncProgress(milestones.map((item) => (item.id === milestone.id ? { ...item, completedAt } : item))) },
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y rounded-xl border">
        {milestones.map((milestone) => (
          <li key={milestone.id} className="group flex items-center gap-3 px-3 py-2.5">
            <Checkbox
              checked={milestone.completedAt !== null}
              aria-label={t("common.complete", { title: milestone.title })}
              onCheckedChange={(checked) => toggle(milestone, checked === true)}
            />
            <span className={cn("min-w-0 flex-1 truncate text-sm", milestone.completedAt && "text-muted-foreground line-through")}>
              {milestone.title}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("common.removeItem", { title: milestone.title })}
              onClick={() =>
                remove.mutate(
                  { goalId: goal.id, milestoneId: milestone.id },
                  { onSuccess: () => syncProgress(milestones.filter((item) => item.id !== milestone.id)) },
                )
              }
            >
              <X />
            </Button>
          </li>
        ))}
        {milestones.length === 0 ? <li className="px-3 py-3 text-sm text-muted-foreground">{t("goals.noMilestones")}</li> : null}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (title.trim()) add.mutate({ goalId: goal.id, title: title.trim() }, { onSuccess: () => setTitle("") })
        }}
      >
        <Input aria-label={t("goals.newMilestone")} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("goals.addMilestone")} className="h-8" />
        <Button type="submit" size="sm" variant="outline" disabled={!title.trim() || add.isPending}>
          <Plus />
          {t("common.add")}
        </Button>
      </form>
    </div>
  )
}
