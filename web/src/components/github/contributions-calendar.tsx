import { ContributionsGrid } from "@/components/github/contributions-grid"
import { DataState } from "@/components/shared/data-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useContributions } from "@/hooks/queries/use-github"
import type { ContributionsCalendarProps } from "@/types/github"

/** The GitHub-style yearly contributions grid, tinted with the app accent. */
export function ContributionsCalendar({ enabled }: ContributionsCalendarProps) {
  const contributions = useContributions(enabled)

  return (
    <div className="min-w-0">
      <DataState isLoading={contributions.isLoading} error={contributions.error} loading={<Skeleton className="h-32 w-full rounded-xl" />}>
        {contributions.data ? <ContributionsGrid contributions={contributions.data} /> : null}
      </DataState>
    </div>
  )
}
