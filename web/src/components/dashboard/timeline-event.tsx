import { useTranslation } from "react-i18next"
import { MapPin } from "lucide-react"
import { countdown } from "@/lib/dashboard"
import { formatTime } from "@/lib/dates"
import { cn } from "@/lib/utils"
import type { TimelineEventProps } from "@/types/dashboard"

/** One timed event of today: past ones dimmed, the next one highlighted with a countdown. */
export function TimelineEvent({ item, now, onOpen }: TimelineEventProps) {
  const { t } = useTranslation()
  const { event, state } = item

  return (
    <li>
      <button
        type="button"
        aria-label={t("dashboard.openEvent", { title: event.title })}
        aria-current={state === "current" ? "time" : undefined}
        onClick={() => onOpen(event)}
        className={cn(
          "flex w-full cursor-pointer items-start gap-3 rounded-xl border border-l-[3px] px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring",
          state === "past" && "opacity-55",
          state === "next" && "border-primary/40 bg-primary/5",
        )}
        style={{ borderLeftColor: event.color }}
      >
        <span className="flex w-16 shrink-0 flex-col text-xs whitespace-nowrap tabular-nums">
          <span className="font-medium">{formatTime(event.startAt)}</span>
          <span className="text-muted-foreground">{formatTime(event.endAt)}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm font-medium", state === "past" && "line-through decoration-muted-foreground/60")}>
            {event.title}
          </span>
          {event.location ? (
            <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{event.location}</span>
            </span>
          ) : null}
        </span>
        {state === "next" || state === "current" ? (
          <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
            {state === "next" ? countdown(event.startAt, now) : t("dashboard.happeningNow")}
          </span>
        ) : null}
      </button>
    </li>
  )
}
