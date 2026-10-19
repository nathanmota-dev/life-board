import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { useUpdateGoal } from "@/hooks/queries/use-goals"
import type { GoalManualProgressProps } from "@/types/goal"

/** The progress typed by hand, saved on blur or Enter. */
export function GoalManualProgress({ goal }: GoalManualProgressProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState(String(goal.progress))
  const update = useUpdateGoal()

  const commit = () => {
    const parsed = Number(value)
    const progress = Number.isFinite(parsed) && value.trim() !== "" ? Math.min(100, Math.max(0, Math.round(parsed))) : goal.progress
    setValue(String(progress))
    if (progress !== goal.progress) update.mutate({ id: goal.id, input: { progress } })
  }

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {t("goals.manualProgress")}
      <Input
        type="number"
        min={0}
        max={100}
        className="h-8 w-20 tabular-nums"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && commit()}
      />
      %
    </label>
  )
}
