import { useTranslation } from "react-i18next"
import { ChevronDown, Repeat } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useHabits } from "@/hooks/queries/use-habits"
import type { GoalHabitPickerProps } from "@/types/goal"

/** Multi-select of the habits that count towards a goal. */
export function GoalHabitPicker({ selected, onChange }: GoalHabitPickerProps) {
  const { t } = useTranslation()
  const habits = useHabits()
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal">
          <span className="flex items-center gap-2">
            <Repeat className="text-muted-foreground" />
            {selected.length > 0 ? t("counts.linkedHabit", { count: selected.length }) : t("goals.linkHabits")}
          </span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-(--radix-popover-trigger-width) overflow-y-auto p-1">
        <ul>
          {(habits.data ?? []).map((habit) => (
            <li key={habit.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                <Checkbox checked={selected.includes(habit.id)} onCheckedChange={() => toggle(habit.id)} />
                <span aria-hidden="true">{habit.emoji}</span>
                <span className="truncate">{habit.name}</span>
              </label>
            </li>
          ))}
        </ul>
        {habits.data?.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">{t("goals.noHabits")}</p> : null}
      </PopoverContent>
    </Popover>
  )
}
