import { ActivityCalendar } from "react-activity-calendar"
import "react-activity-calendar/tooltips.css"
import { useAccent } from "@/components/accent-provider"
import { DataState } from "@/components/shared/data-state"
import { useTheme } from "@/components/theme-provider"
import { Skeleton } from "@/components/ui/skeleton"
import { useContributions } from "@/hooks/queries/use-github"
import { useElementWidth } from "@/hooks/use-element-width"
import { formatDate, fromDayKey } from "@/lib/dates"
import { pluralize } from "@/lib/format"
import { CALENDAR_BLOCK_MARGIN, contributionBlockSize, contributionWeeks } from "@/lib/github"
import type { ContributionsCalendarProps } from "@/types/github"

/** The GitHub-style yearly contributions grid, tinted with the app accent. */
export function ContributionsCalendar({ enabled }: ContributionsCalendarProps) {
  const { theme } = useTheme()
  const { accent } = useAccent()
  const contributions = useContributions(enabled)
  const [containerRef, width] = useElementWidth<HTMLDivElement>()
  const days = contributions.data?.days ?? []
  const blockSize = contributionBlockSize(width, contributionWeeks(days))

  return (
    <div ref={containerRef} className="min-w-0">
      <DataState isLoading={contributions.isLoading} error={contributions.error} loading={<Skeleton className="h-32 w-full rounded-xl" />}>
        <div className="overflow-x-auto pb-1">
          <ActivityCalendar
            data={days}
            colorScheme={theme}
            theme={{ light: ["#ebedf0", accent], dark: ["#262626", accent] }}
            blockSize={blockSize}
            blockMargin={CALENDAR_BLOCK_MARGIN}
            blockRadius={3}
            fontSize={12}
            labels={{ totalCount: "{{count}} contributions in the last year" }}
            tooltips={{
              activity: {
                text: (activity) => `${pluralize(activity.count, "contribution")} on ${formatDate(fromDayKey(activity.date), { dateStyle: "medium" })}`,
              },
            }}
          />
        </div>
      </DataState>
    </div>
  )
}
