import { useTranslation } from "react-i18next"
import { GoalHabitPicker } from "@/components/goals/goal-habit-picker"
import { useHabits } from "@/hooks/queries/use-habits"
import { useUpdateGoal } from "@/hooks/queries/use-goals"
import type { GoalLinkedHabitsProps } from "@/types/goal"

export function GoalLinkedHabits({ goal }: GoalLinkedHabitsProps) {
  const { t } = useTranslation()
  const habits = useHabits()
  const update = useUpdateGoal()
  const linked = (habits.data ?? []).filter((habit) => goal.linkedHabitIds.includes(habit.id))

  return (
    <div className="flex flex-col gap-2">
      {linked.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {linked.map((habit) => (
            <li key={habit.id} className="flex h-7 items-center gap-1.5 rounded-md border px-2 text-sm">
              <span aria-hidden="true">{habit.emoji}</span>
              <span className="truncate">{habit.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("goals.noLinkedHabits")}</p>
      )}
      <GoalHabitPicker
        selected={goal.linkedHabitIds}
        onChange={(linkedHabitIds) => update.mutate({ id: goal.id, input: { linkedHabitIds } })}
      />
    </div>
  )
}
