import { useTranslation } from "react-i18next"
import { Pencil, Trash2 } from "lucide-react"
import { GoalLinkedTasks } from "@/components/goals/goal-linked-tasks"
import { GoalMilestones } from "@/components/goals/goal-milestones"
import { SelectField } from "@/components/shared/select-field"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useRemoveGoal, useUpdateGoal } from "@/hooks/queries/use-goals"
import { formatDate } from "@/lib/dates"
import { getGoalStatusOptions } from "@/lib/goals"
import type { GoalDetailBodyProps } from "@/types/goal"

export function GoalDetailBody({ detail, onClose, onEdit }: GoalDetailBodyProps) {
  const { t } = useTranslation()
  const { goal, milestones } = detail
  const update = useUpdateGoal()
  const remove = useRemoveGoal()

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b px-5 py-4">
        <SheetTitle className="pr-8">{goal.title}</SheetTitle>
        <SheetDescription>{goal.why || t("goals.domainGoal", { domain: t(`goalDomains.${goal.domain}`) })}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("goals.progress")}</span>
            <span className="font-medium tabular-nums">{goal.progress}%</span>
          </div>
          <Progress value={goal.progress} aria-label={t("goals.goalProgress")} className="h-2" />
        </section>
        <section className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{t("common.status")}</span>
            <SelectField
              id="goal-status"
              value={goal.status}
              options={getGoalStatusOptions()}
              onChange={(status) => update.mutate({ id: goal.id, input: { status } })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{t("goals.target")}</span>
            <span className="flex h-9 items-center rounded-md border px-3">{goal.targetAt ? formatDate(goal.targetAt, { dateStyle: "medium" }) : "—"}</span>
          </div>
        </section>
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">{t("goals.milestones")}</h3>
          <GoalMilestones goal={goal} milestones={milestones} />
        </section>
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">{t("goals.linkedTasks")}</h3>
          <GoalLinkedTasks taskIds={goal.linkedTaskIds} />
        </section>
      </div>
      <div className="flex justify-between gap-2 border-t px-5 py-3">
        <Button variant="ghost" className="text-destructive" onClick={() => remove.mutate(goal.id, { onSuccess: onClose })}>
          <Trash2 />
          {t("common.delete")}
        </Button>
        <Button variant="outline" onClick={() => onEdit(goal)}>
          <Pencil />
          {t("goals.editGoal")}
        </Button>
      </div>
    </div>
  )
}
