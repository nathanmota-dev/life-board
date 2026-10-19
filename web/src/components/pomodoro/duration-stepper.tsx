import { useTranslation } from "react-i18next"
import { Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { DurationStepperProps } from "@/types/pomodoro"

export function DurationStepper({ id, label, unit, value, min, max, step = 1, onChange }: DurationStepperProps) {
  const { t } = useTranslation()
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)))

  return (
    <div className="flex items-center justify-between gap-3">
      <span id={id} className="text-sm">{label}</span>
      <div role="group" aria-labelledby={id} className="inline-flex items-center rounded-lg border bg-background p-0.5 shadow-xs">
        <Button variant="ghost" size="icon-sm" className="size-7 cursor-pointer" aria-label={t("pomodoro.decrease", { label })} disabled={value <= min} onClick={() => set(value - step)}>
          <Minus />
        </Button>
        <output aria-live="polite" className="min-w-16 text-center text-sm tabular-nums">
          {value} <span className="text-muted-foreground">{unit}</span>
        </output>
        <Button variant="ghost" size="icon-sm" className="size-7 cursor-pointer" aria-label={t("pomodoro.increase", { label })} disabled={value >= max} onClick={() => set(value + step)}>
          <Plus />
        </Button>
      </div>
    </div>
  )
}
