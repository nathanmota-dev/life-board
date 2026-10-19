import { useTranslation } from "react-i18next"
import { Ban, Check } from "lucide-react"
import { getTaskColorOptions, TASK_COLOR_CLASSES } from "@/lib/tasks"
import { cn } from "@/lib/utils"
import type { TaskColorPickerProps } from "@/types/task"

const SWATCH = "flex size-7 cursor-pointer items-center justify-center rounded-full border transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring"

export function TaskColorPicker({ value, clearLabel, onChange }: TaskColorPickerProps) {
  const { t } = useTranslation()

  return (
    <div role="group" aria-label={t("tasks.color")} className="flex max-w-56 flex-wrap gap-1.5">
      <button type="button" aria-label={clearLabel} aria-pressed={value === null} onClick={() => onChange(null)} className={cn(SWATCH, "bg-background text-muted-foreground", value === null && "border-primary")}>
        <Ban className="size-3.5" />
      </button>
      {getTaskColorOptions().map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.label}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(SWATCH, TASK_COLOR_CLASSES[option.value].swatch, value === option.value && "border-primary")}
        >
          {value === option.value ? <Check className="size-3.5" /> : null}
        </button>
      ))}
    </div>
  )
}
