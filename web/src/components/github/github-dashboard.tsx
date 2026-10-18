import { useState } from "react"
import { GitPullRequest, RefreshCw } from "lucide-react"
import { ContributionsCalendar } from "@/components/github/contributions-calendar"
import { GithubPrTable } from "@/components/github/github-pr-table"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { Button } from "@/components/ui/button"
import { PageSection, Panel } from "@/components/workspace-ui"
import { useGithubPrs, useSyncGithub } from "@/hooks/queries/use-github"
import { formatRelativeDay } from "@/lib/dates"
import { errorMessage } from "@/lib/format"
import { KIND_OPTIONS } from "@/lib/github"
import type { GithubDashboardProps, GithubView } from "@/types/github"

export function GithubDashboard({ status }: GithubDashboardProps) {
  const [view, setView] = useState<GithubView>("all")
  const prs = useGithubPrs(view === "all" ? undefined : view)
  const sync = useSyncGithub()
  const items = prs.data ?? []

  return (
    <>
      <PageSection>
        <Panel title={`@${status.login}`} action={<span className="text-xs text-muted-foreground">Contributions</span>}>
          <ContributionsCalendar enabled />
        </Panel>
      </PageSection>
      <PageSection
        title="Pull requests"
        action={
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {status.lastSyncAt ? `Synced ${formatRelativeDay(status.lastSyncAt)}` : "Never synced"}
            </span>
            <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(undefined)}>
              <RefreshCw className={sync.isPending ? "animate-spin" : undefined} />
              Sync
            </Button>
          </div>
        }
      >
        <div className="mb-4">
          <SegmentedControl label="Pull request views" value={view} onChange={setView} options={[{ value: "all", label: "All" }, ...KIND_OPTIONS]} />
        </div>
        {sync.error || status.lastSyncError ? (
          <p className="mb-4 text-sm text-destructive">{sync.error ? errorMessage(sync.error) : status.lastSyncError}</p>
        ) : null}
        <DataState
          isLoading={prs.isLoading}
          error={prs.error}
          isEmpty={items.length === 0}
          empty={<EmptyState icon={GitPullRequest} title="No pull requests" description="Sync to fetch open PRs that involve you." />}
        >
          <GithubPrTable prs={items} />
        </DataState>
      </PageSection>
    </>
  )
}
