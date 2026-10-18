import { useTranslation } from "react-i18next"
import { useState } from "react"
import { DialogForm } from "@/components/shared/dialog-form"
import { FormField } from "@/components/shared/form-field"
import { Input } from "@/components/ui/input"
import { useCreateHabit, useUpdateHabit } from "@/hooks/queries/use-habits"
import type { HabitFormDialogProps, HabitFormValues } from "@/types/habit"

export function HabitFormDialog({ open, habit, onOpenChange }: HabitFormDialogProps) {
  const { t } = useTranslation()
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
      title={habit ? t("habits.editHabit") : t("habits.newHabit")}
      description={t("habits.formDescription")}
      submitLabel={habit ? t("common.save") : t("habits.addHabit")}
      isPending={mutation.isPending}
      error={mutation.error}
      onSubmit={submit}
    >
      <FormField label={t("common.name")} htmlFor="habit-name">
        <Input id="habit-name" autoFocus value={values.name} onChange={set("name")} placeholder={t("habits.namePlaceholder")} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t("habits.dailyGoal")} htmlFor="habit-target">
          <Input id="habit-target" type="number" min={1} value={values.target} onChange={set("target")} />
        </FormField>
        <FormField label={t("habits.unit")} htmlFor="habit-unit">
          <Input id="habit-unit" value={values.unit} onChange={set("unit")} placeholder={t("habits.unitPlaceholder")} />
        </FormField>
      </div>
    </DialogForm>
  )
}
