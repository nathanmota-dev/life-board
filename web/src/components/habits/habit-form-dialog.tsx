import { useTranslation } from "react-i18next"
import { useState } from "react"
import { DialogForm } from "@/components/shared/dialog-form"
import { FormField } from "@/components/shared/form-field"
import { HabitEmojiPicker } from "@/components/habits/habit-emoji-picker"
import { Input } from "@/components/ui/input"
import { useCreateHabit, useUpdateHabit } from "@/hooks/queries/use-habits"
import { habitUnit } from "@/lib/habits"
import type { HabitFormDialogProps, HabitFormValues } from "@/types/habit"

export function HabitFormDialog({ open, habit, onOpenChange }: HabitFormDialogProps) {
  const { t } = useTranslation()
  const [values, setValues] = useState<HabitFormValues>({
    name: habit?.name ?? "", target: String(habit?.target ?? 1), unit: habit?.unit ?? "",
    step: String(habit?.step ?? 1), emoji: habit?.emoji ?? "🌱",
  })
  const [validation, setValidation] = useState("")
  const create = useCreateHabit()
  const update = useUpdateHabit()
  const mutation = habit ? update : create
  const set = (field: keyof HabitFormValues) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [field]: event.target.value }))
  const target = Number(values.target)
  const step = Number(values.step)
  const valid = [target, step].every((value) => Number.isInteger(value) && value >= 1 && value <= 10_000)

  const submit = () => {
    const input = { name: values.name.trim(), target, unit: values.unit.trim() || "times", step, emoji: values.emoji.trim() }
    if (!valid || !input.name || !input.emoji) {
      setValidation(t("habits.invalidForm"))
      return
    }
    const done = { onSuccess: () => onOpenChange(false) }
    if (habit) update.mutate({ id: habit.id, input }, done)
    else create.mutate(input, done)
  }

  return (
    <DialogForm open={open} onOpenChange={onOpenChange} title={habit ? t("habits.editHabit") : t("habits.newHabit")}
      description={t("habits.formDescription")} submitLabel={habit ? t("common.save") : t("habits.addHabit")}
      isPending={mutation.isPending} error={mutation.error} onSubmit={submit}>
      <FormField label={t("common.name")} htmlFor="habit-name">
        <Input id="habit-name" autoFocus required maxLength={120} value={values.name} onChange={set("name")} placeholder={t("habits.namePlaceholder")} />
      </FormField>
      <HabitEmojiPicker value={values.emoji} onChange={(emoji) => setValues((current) => ({ ...current, emoji }))} />
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t("habits.dailyGoal")} htmlFor="habit-target">
          <Input id="habit-target" type="number" min={1} max={10000} step={1} required value={values.target} onChange={set("target")} />
        </FormField>
        <FormField label={t("habits.unit")} htmlFor="habit-unit">
          <Input id="habit-unit" maxLength={40} value={values.unit} onChange={set("unit")} placeholder={t("habits.unitPlaceholder")} />
        </FormField>
      </div>
      <FormField label={t("habits.step")} htmlFor="habit-step">
        <Input id="habit-step" type="number" min={1} max={10000} step={1} required value={values.step} onChange={set("step")} />
        <p className="mt-1.5 text-xs text-muted-foreground">{t("habits.stepHint")}</p>
      </FormField>
      <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
        <span className="text-3xl" aria-hidden="true">{values.emoji}</span>
        <div>
          <p className="text-sm font-medium">{valid ? t("habits.goalPreview", { count: Math.ceil(target / step) }) : t("habits.dailyGoal")}</p>
          <p className="text-xs text-muted-foreground">{valid ? t("habits.amountPreview", { step, target, unit: habitUnit(values.unit || "times") }) : t("habits.invalidForm")}</p>
        </div>
      </div>
      {habit ? <p className="text-xs text-muted-foreground">{t("habits.editHint")}</p> : null}
      {validation ? <p role="alert" className="text-sm text-destructive">{validation}</p> : null}
    </DialogForm>
  )
}
