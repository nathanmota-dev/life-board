import { useState } from "react"
import { DialogForm } from "@/components/shared/dialog-form"
import { FormField } from "@/components/shared/form-field"
import { SelectField } from "@/components/shared/select-field"
import { TaskPicker } from "@/components/thoughts/task-picker"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCreateGoal, useUpdateGoal } from "@/hooks/queries/use-goals"
import { emptyGoalValues, GOAL_DOMAIN_OPTIONS, goalToValues, valuesToGoalInput } from "@/lib/goals"
import type { GoalFormDialogProps, GoalFormValues } from "@/types/goal"

export function GoalFormDialog({ open, goal, onOpenChange }: GoalFormDialogProps) {
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
      title={goal ? "Edit goal" : "New goal"}
      description="Something you want to get to, and why it matters."
      submitLabel={goal ? "Save" : "Create goal"}
      isPending={mutation.isPending}
      error={mutation.error}
      onSubmit={submit}
    >
      <FormField label="Goal" htmlFor="goal-title">
        <Input id="goal-title" autoFocus value={values.title} onChange={(event) => set("title", event.target.value)} placeholder="Read 12 books this year" />
      </FormField>
      <FormField label="Why it matters" htmlFor="goal-why">
        <Textarea id="goal-why" rows={2} value={values.why} onChange={(event) => set("why", event.target.value)} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Area" htmlFor="goal-domain">
          <SelectField id="goal-domain" value={values.domain} options={GOAL_DOMAIN_OPTIONS} onChange={(domain) => set("domain", domain)} />
        </FormField>
        <FormField label="Target date" htmlFor="goal-target">
          <Input id="goal-target" type="date" value={values.targetAt} onChange={(event) => set("targetAt", event.target.value)} />
        </FormField>
      </div>
      {goal ? null : (
        <FormField label="Milestones" htmlFor="goal-milestones" hint="One per line.">
          <Textarea id="goal-milestones" rows={3} value={values.milestones} onChange={(event) => set("milestones", event.target.value)} />
        </FormField>
      )}
      <FormField label="Related tasks" htmlFor="goal-tasks">
        <TaskPicker selected={values.linkedTaskIds} onChange={(ids) => set("linkedTaskIds", ids)} />
      </FormField>
    </DialogForm>
  )
}
