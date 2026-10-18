import { Link } from "@tanstack/react-router"
import { ChevronRight, Lightbulb } from "lucide-react"
import { formatRelativeDay } from "@/lib/dates"
import { stripHtml, thoughtTitle } from "@/lib/thoughts"
import type { RecentThoughtsProps } from "@/types/inbox"

export function RecentThoughts({ thoughts }: RecentThoughtsProps) {
  return (
    <ul className="flex flex-col">
      {thoughts.map((thought) => (
        <li key={thought.id}>
          <Link to="/thoughts" className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Lightbulb className="size-4" strokeWidth={1.7} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{thoughtTitle(thought)}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {formatRelativeDay(thought.createdAt)} · {stripHtml(thought.body).slice(0, 80) || "No details"}
              </span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
