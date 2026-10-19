import { Check, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { habitProgress } from "@/lib/habits"
import type { HabitProgressRingProps } from "@/types/habit"

export function HabitProgressRing({ habit, pending, onLog }: HabitProgressRingProps) {
  const { t } = useTranslation()
  const steps = Math.ceil(habit.target / habit.step)
  const segments = Math.min(steps, 24)
  const circumference = 2 * Math.PI * 30
  const length = circumference / segments
  const fraction = Math.min(habit.todayCount / habit.target, 1)

  return (
    <button
      type="button"
      aria-label={t("habits.log", { name: habit.name })}
      title={t("habits.addAmount", { amount: habit.step, unit: habit.unit })}
      disabled={pending}
      onClick={onLog}
      className="relative flex size-20 shrink-0 cursor-pointer items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/8 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
    >
      <svg viewBox="0 0 72 72" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        {Array.from({ length: segments }, (_, index) => (
          <circle key={`track-${index}`} cx="36" cy="36" r="30" fill="none" stroke="currentColor" strokeWidth="5"
            className="text-primary/15" strokeDasharray={`${Math.max(length - 4, 1)} ${circumference - Math.max(length - 4, 1)}`} strokeDashoffset={-index * length} />
        ))}
        {Array.from({ length: segments }, (_, index) => {
          const filled = Math.max(0, Math.min(1, fraction * segments - index))
          return filled > 0 ? <circle key={index} cx="36" cy="36" r="30" fill="none" stroke="currentColor" strokeWidth="5"
            strokeDasharray={`${Math.max(length - 4, 1) * filled} ${circumference - Math.max(length - 4, 1) * filled}`} strokeDashoffset={-index * length} /> : null
        })}
      </svg>
      {habit.doneToday ? <Check className="size-6" /> : <Plus className="size-6" />}
      <span className="sr-only">{habitProgress(habit)}%</span>
    </button>
  )
}
