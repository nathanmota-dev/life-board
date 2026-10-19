import { GoalCard } from "@/components/goals/goal-card"
import type { GoalCardListProps } from "@/types/goal"

export function GoalCardList({ goals, onOpen }: GoalCardListProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} onOpen={onOpen} />
      ))}
    </div>
  )
}
