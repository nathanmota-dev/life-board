import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, Minus, Plus } from "lucide-react"
import { DialogForm } from "@/components/shared/dialog-form"
import { FormField } from "@/components/shared/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { useSetHabitLog } from "@/hooks/queries/use-habits"
import { formatDate, fromDayKey } from "@/lib/dates"
import { habitDayStatus, habitUnit, MAX_HABIT_COUNT } from "@/lib/habits"
import type { HabitDayDialogProps } from "@/types/habit"

export function HabitDayDialog({ edit: { habit, entry }, onClose }: HabitDayDialogProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState(String(entry.count))
  const save = useSetHabitLog()
  const unit = habitUnit(habit.unit)
  const parsed = Number(value)
  const valid = value.trim() !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_HABIT_COUNT
  const count = valid ? parsed : entry.count
  const preview = { ...entry, count, eligible: true, done: count >= entry.target }
  const adjust = (delta: number) => setValue(String(Math.min(MAX_HABIT_COUNT, Math.max(0, count + delta))))
  const submit = () => {
    if (valid) save.mutate({ id: habit.id, day: entry.day, count: parsed }, { onSuccess: onClose })
  }

  return (
    <DialogForm open onOpenChange={(open) => { if (!open) onClose() }} title={`${habit.emoji} ${habit.name}`}
      description={formatDate(fromDayKey(entry.day), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      submitLabel={t("common.save")} isPending={save.isPending || !valid} error={save.error} onSubmit={submit}
      footer={<Button type="button" variant="ghost" disabled={valid && parsed === 0} onClick={() => setValue("0")}>{t("habits.clearDay")}</Button>}>
      <FormField label={t("habits.dayAmount", { unit })} htmlFor="habit-day-count">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label={t("habits.removeAmount", { amount: habit.step, unit })}
            disabled={count === 0} onClick={() => adjust(-habit.step)}><Minus /></Button>
          <Input id="habit-day-count" type="number" inputMode="numeric" min={0} max={MAX_HABIT_COUNT} step={1} autoFocus
            value={value} onChange={(event) => setValue(event.target.value)} className="text-center text-lg tabular-nums" />
          <Button type="button" variant="outline" size="icon" aria-label={t("habits.addAmountButton", { amount: habit.step, unit })}
            disabled={count >= MAX_HABIT_COUNT} onClick={() => adjust(habit.step)}><Plus /></Button>
        </div>
      </FormField>
      <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium" aria-live="polite">{t(`habits.${habitDayStatus(preview)}`)} · {count} / {entry.target} {unit}</p>
            <p className="text-xs text-muted-foreground">{t("habits.dayGoalHint")}</p>
          </div>
          <Button type="button" size="sm" variant="secondary" disabled={valid && parsed >= entry.target} onClick={() => setValue(String(entry.target))}>
            <Check />{t("habits.markGoalMet")}
          </Button>
        </div>
        <Progress value={Math.min(100, Math.round((count / entry.target) * 100))} aria-label={t("common.itemProgress", { title: habit.name })} className="h-1.5" />
      </div>
      {valid ? null : <p role="alert" className="text-sm text-destructive">{t("habits.invalidDayAmount")}</p>}
    </DialogForm>
  )
}
