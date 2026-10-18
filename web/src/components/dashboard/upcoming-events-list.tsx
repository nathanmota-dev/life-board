import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { formatDate, formatTime } from "@/lib/dates"
import type { UpcomingEventsListProps } from "@/types/dashboard"

export function UpcomingEventsList({ events }: UpcomingEventsListProps) {
  return (
    <ul className="flex flex-col">
      {events.map((event) => (
        <li key={event.id}>
          <Link to="/calendar" className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60">
            <span
              className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg border-t-[3px] bg-muted text-center leading-none"
              style={{ borderTopColor: event.color }}
            >
              <span className="text-[10px] text-muted-foreground uppercase">{formatDate(event.startAt, { weekday: "short" })}</span>
              <span className="text-sm font-semibold">{formatDate(event.startAt, { day: "2-digit" })}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{event.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {event.allDay ? "All day" : `${formatTime(event.startAt)} – ${formatTime(event.endAt)}`}
                {event.location ? ` · ${event.location}` : ""}
              </span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
