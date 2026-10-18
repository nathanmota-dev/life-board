import { ThoughtCard } from "@/components/thoughts/thought-card"
import type { ThoughtGridProps } from "@/types/thought"

export function ThoughtGrid({ thoughts, onEdit }: ThoughtGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {thoughts.map((thought) => (
        <ThoughtCard key={thought.id} thought={thought} onEdit={onEdit} />
      ))}
    </div>
  )
}
