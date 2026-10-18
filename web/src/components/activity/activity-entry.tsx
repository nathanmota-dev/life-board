import { activityTime } from "@/lib/activity"
import type { ActivityEntryProps } from "@/types/activity"

export function ActivityEntry({ item }: ActivityEntryProps) {
  const Icon = item.icon

  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-card text-primary">
        <Icon className="size-4" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-medium">{item.title}</p>
          <time className="shrink-0 text-xs text-muted-foreground tabular-nums">{activityTime(item)}</time>
        </div>
        <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
      </div>
    </li>
  )
}
