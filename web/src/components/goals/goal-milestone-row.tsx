import { useTranslation } from "react-i18next"
import { X } from "lucide-react"
import { DatePicker } from "@/components/shared/date-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useRemoveMilestone, useUpdateMilestone } from "@/hooks/queries/use-goals"
import { fromDateInput, toDateInput } from "@/lib/dates"
import { cn } from "@/lib/utils"
import type { GoalMilestoneRowProps } from "@/types/goal"

export function GoalMilestoneRow({ goal, milestone }: GoalMilestoneRowProps) {
  const { t } = useTranslation()
  const update = useUpdateMilestone()
  const remove = useRemoveMilestone()
  const ids = { goalId: goal.id, milestoneId: milestone.id }

  return (
    <li className="group flex items-center gap-3 px-3 py-2.5">
      <Checkbox
        checked={milestone.completedAt !== null}
        aria-label={t("common.complete", { title: milestone.title })}
        onCheckedChange={(checked) => update.mutate({ ...ids, input: { completedAt: checked === true ? new Date().toISOString() : null } })}
      />
      <span className={cn("min-w-0 flex-1 truncate text-sm", milestone.completedAt && "text-muted-foreground line-through")}>
        {milestone.title}
      </span>
      <DatePicker
        label={t("goals.milestoneDue", { title: milestone.title })}
        clearable
        value={toDateInput(milestone.dueAt)}
        onChange={(day) => update.mutate({ ...ids, input: { dueAt: fromDateInput(day) } })}
        className="h-7 w-auto gap-1.5 px-2 text-xs"
      />
      <Button variant="ghost" size="icon-xs" aria-label={t("common.removeItem", { title: milestone.title })} onClick={() => remove.mutate(ids)}>
        <X />
      </Button>
    </li>
  )
}
