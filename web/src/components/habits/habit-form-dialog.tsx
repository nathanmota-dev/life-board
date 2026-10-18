import { useState } from "react"
import { DialogForm } from "@/components/shared/dialog-form"
import { FormField } from "@/components/shared/form-field"
import { Input } from "@/components/ui/input"
import { useCreateHabit, useUpdateHabit } from "@/hooks/queries/use-habits"
import type { HabitFormDialogProps, HabitFormValues } from "@/types/habit"

export function HabitFormDialog({ open, habit, onOpenChange }: HabitFormDialogProps) {
  const [values, setValues] = useState<HabitFormValues>({
    name: habit?.name ?? "",
    target: String(habit?.target ?? 1),
    unit: habit?.unit ?? "",
  })
  const create = useCreateHabit()
  const update = useUpdateHabit()
  const mutation = habit ? update : create
  const set = (field: keyof HabitFormValues) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [field]: event.target.value }))

  const submit = () => {
    const target = Number(values.target)
    const input = { name: values.name.trim(), target, unit: values.unit.trim() || "times" }
    const done = { onSuccess: () => onOpenChange(false) }
    if (input.name && Number.isInteger(target) && target >= 1) {
      if (habit) update.mutate({ id: habit.id, input }, done)
      else create.mutate(input, done)
    }
  }

  return (
    <DialogForm
      open={open}
      onOpenChange={onOpenChange}
      title={habit ? "Edit habit" : "New habit"}
      description="Set a daily goal and log it as you go."
      submitLabel={habit ? "Save" : "Add habit"}
      isPending={mutation.isPending}
      error={mutation.error}
      onSubmit={submit}
    >
      <FormField label="Name" htmlFor="habit-name">
        <Input id="habit-name" autoFocus value={values.name} onChange={set("name")} placeholder="Drink water, read, stretch…" />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Daily goal" htmlFor="habit-target">
          <Input id="habit-target" type="number" min={1} value={values.target} onChange={set("target")} />
        </FormField>
        <FormField label="Unit" htmlFor="habit-unit">
          <Input id="habit-unit" value={values.unit} onChange={set("unit")} placeholder="glasses" />
        </FormField>
      </div>
    </DialogForm>
  )
}
