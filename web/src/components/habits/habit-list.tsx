import { HabitRow } from "@/components/habits/habit-row"
import { habitWeek } from "@/lib/habits"
import type { HabitListProps } from "@/types/habit"

export function HabitList({ habits, logs, onEdit, onEditDay }: HabitListProps) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {habits.map((habit) => (
        <HabitRow key={habit.id} habit={habit} week={habitWeek(habit, logs)} onEdit={onEdit} onEditDay={onEditDay} />
      ))}
    </ul>
  )
}
