import { HabitRow } from "@/components/habits/habit-row"
import { habitWeek } from "@/lib/habits"
import type { HabitListProps } from "@/types/habit"

export function HabitList({ habits, logs, onEdit }: HabitListProps) {
  return (
    <ul className="divide-y rounded-2xl border bg-card shadow-xs">
      {habits.map((habit) => (
        <HabitRow key={habit.id} habit={habit} week={habitWeek(habit, logs)} onEdit={onEdit} />
      ))}
    </ul>
  )
}
