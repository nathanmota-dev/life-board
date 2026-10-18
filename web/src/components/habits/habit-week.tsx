import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { HabitWeekProps } from "@/types/habit"

export function HabitWeek({ week }: HabitWeekProps) {
  return (
    <ol className="flex gap-1" aria-label="Last 7 days">
      {week.map((day) => (
        <li
          key={day.day}
          title={`${day.day}: ${day.count}`}
          className={cn(
            "flex size-6 items-center justify-center rounded-md border text-[10px] text-muted-foreground",
            day.done && "border-primary bg-primary text-primary-foreground",
          )}
        >
          {day.done ? <Check className="size-3" aria-label="Goal met" /> : day.label}
        </li>
      ))}
    </ol>
  )
}
