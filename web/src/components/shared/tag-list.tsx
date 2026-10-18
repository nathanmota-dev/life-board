import { cn } from "@/lib/utils"
import type { TagListProps } from "@/types/ui"

export function TagList({ tags, className }: TagListProps) {
  return (
    <ul className={cn("flex flex-wrap gap-1", className)} aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          #{tag}
        </li>
      ))}
    </ul>
  )
}
