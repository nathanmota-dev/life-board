import { useTranslation } from "react-i18next"
import { useState } from "react"
import { DialogForm } from "@/components/shared/dialog-form"
import { GoalHabitPicker } from "@/components/goals/goal-habit-picker"
import { FormField } from "@/components/shared/form-field"
import { SelectField } from "@/components/shared/select-field"
import { TaskPicker } from "@/components/thoughts/task-picker"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCreateGoal, useUpdateGoal } from "@/hooks/queries/use-goals"
import { emptyGoalValues, getGoalDomainOptions, goalToValues, valuesToGoalInput } from "@/lib/goals"
import type { GoalFormDialogProps, GoalFormValues } from "@/types/goal"

export function GoalFormDialog({ open, goal, onOpenChange }: GoalFormDialogProps) {
  const { t } = useTranslation()
  const [values, setValues] = useState(() => (goal ? goalToValues(goal) : emptyGoalValues()))
  const create = useCreateGoal()
  const update = useUpdateGoal()
  const mutation = goal ? update : create
  const set = <K extends keyof GoalFormValues>(field: K, value: GoalFormValues[K]) =>
    setValues((current) => ({ ...current, [field]: value }))

  const submit = () => {
    const { milestones, ...input } = valuesToGoalInput(values)
    const close = { onSuccess: () => onOpenChange(false) }
    if (input.title) {
      if (goal) update.mutate({ id: goal.id, input }, close)
      else create.mutate({ ...input, milestones }, close)
    }
  }

  return (
    <DialogForm
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? t("goals.editGoal") : t("goals.newGoal")}
      description={t("goals.formDescription")}
      submitLabel={goal ? t("common.save") : t("goals.createGoal")}
      isPending={mutation.isPending}
      error={mutation.error}
      onSubmit={submit}
    >
      <FormField label={t("goals.goal")} htmlFor="goal-title">
        <Input id="goal-title" autoFocus value={values.title} onChange={(event) => set("title", event.target.value)} placeholder={t("goals.titlePlaceholder")} />
      </FormField>
      <FormField label={t("goals.whyItMatters")} htmlFor="goal-why">
        <Textarea id="goal-why" rows={2} value={values.why} onChange={(event) => set("why", event.target.value)} />
      </FormField>
      <FormField label={t("goals.area")} htmlFor="goal-domain">
        <SelectField id="goal-domain" value={values.domain} options={getGoalDomainOptions()} onChange={(domain) => set("domain", domain)} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("goals.startDate")} htmlFor="goal-start">
          <Input id="goal-start" type="date" value={values.startAt} max={values.targetAt || undefined} onChange={(event) => set("startAt", event.target.value)} />
        </FormField>
        <FormField label={t("goals.targetDate")} htmlFor="goal-target">
          <Input id="goal-target" type="date" value={values.targetAt} min={values.startAt || undefined} onChange={(event) => set("targetAt", event.target.value)} />
        </FormField>
      </div>
      {goal ? null : (
        <FormField label={t("goals.milestones")} htmlFor="goal-milestones" hint={t("goals.onePerLine")}>
          <Textarea id="goal-milestones" rows={3} value={values.milestones} onChange={(event) => set("milestones", event.target.value)} />
        </FormField>
      )}
      <FormField label={t("goals.relatedTasks")} htmlFor="goal-tasks">
        <TaskPicker selected={values.linkedTaskIds} onChange={(ids) => set("linkedTaskIds", ids)} />
      </FormField>
      <FormField label={t("goals.relatedHabits")} htmlFor="goal-habits">
        <GoalHabitPicker selected={values.linkedHabitIds} onChange={(ids) => set("linkedHabitIds", ids)} />
      </FormField>
    </DialogForm>
  )
}
