import { ActivityEntry } from "@/components/activity/activity-entry"
import { formatDate, formatRelativeDay, fromDayKey } from "@/lib/dates"
import { capitalize } from "@/lib/format"
import type { ActivityTimelineProps } from "@/types/activity"

export function ActivityTimeline({ days }: ActivityTimelineProps) {
  return (
    <div className="flex flex-col gap-6">
      {days.map((group) => (
        <section key={group.day} aria-label={group.day}>
          <h3 className="mb-3 text-xs font-medium text-muted-foreground">
            {capitalize(formatRelativeDay(fromDayKey(group.day)))} · {formatDate(fromDayKey(group.day), { weekday: "long", month: "short", day: "numeric" })}
          </h3>
          <ol className="relative before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-border">
            {group.items.map((item) => (
              <ActivityEntry key={item.id} item={item} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
