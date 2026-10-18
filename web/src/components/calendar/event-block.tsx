import { formatTime } from "@/lib/dates"
import { minuteToOffset } from "@/lib/calendar"
import { cn } from "@/lib/utils"
import type { EventBlockProps } from "@/types/calendar"

export function EventBlock({ item, onOpen }: EventBlockProps) {
  const { event, startMinute, endMinute, lane, lanes } = item
  const top = minuteToOffset(startMinute)
  const height = Math.max(22, minuteToOffset(endMinute) - top - 2)
  const compact = height < 44

  return (
    <button
      type="button"
      onClick={(clickEvent) => {
        clickEvent.stopPropagation()
        onOpen(event)
      }}
      className={cn(
        "absolute flex cursor-pointer overflow-hidden rounded-sm border-t-[3px] px-2 text-left transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-ring",
        compact ? "items-center gap-1.5 py-0.5" : "flex-col py-1",
      )}
      style={{
        top,
        height,
        left: `calc(${(lane / lanes) * 100}% + 2px)`,
        width: `calc(${100 / lanes}% - 4px)`,
        borderTopColor: event.color,
        backgroundColor: `color-mix(in oklab, ${event.color} 12%, var(--card))`,
      }}
    >
      <span className="truncate text-xs font-medium text-foreground">{event.title}</span>
      {event.location && !compact ? <span className="truncate text-[11px] text-muted-foreground">{event.location}</span> : null}
      <span className={cn("truncate text-[11px] text-muted-foreground", !compact && "mt-auto")}>
        {compact ? formatTime(event.startAt) : `${formatTime(event.startAt)} – ${formatTime(event.endAt)}`}
      </span>
    </button>
  )
}
