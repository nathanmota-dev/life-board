import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { ContributionsCalendar } from "@/components/github/contributions-calendar"
import { GithubIssueList } from "@/components/github/github-issue-list"
import { GithubPrList } from "@/components/github/github-pr-list"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { Button } from "@/components/ui/button"
import { PageSection, Panel } from "@/components/workspace-ui"
import { useAutoSyncGithub } from "@/hooks/queries/use-github"
import { formatRelativeDay } from "@/lib/dates"
import { errorMessage } from "@/lib/format"
import { ITEM_TYPE_OPTIONS } from "@/lib/github"
import type { GithubDashboardProps, GithubItemType } from "@/types/github"

export function GithubDashboard({ status }: GithubDashboardProps) {
  const [type, setType] = useState<GithubItemType>("prs")
  const sync = useAutoSyncGithub()

  return (
    <>
      <PageSection>
        <Panel title={`@${status.login}`} action={<span className="text-xs text-muted-foreground">Contributions</span>}>
          <ContributionsCalendar enabled />
        </Panel>
      </PageSection>
      <PageSection>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl label="GitHub item type" value={type} onChange={setType} options={ITEM_TYPE_OPTIONS} />
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {sync.isPending ? "Syncing…" : status.lastSyncAt ? `Synced ${formatRelativeDay(status.lastSyncAt)}` : "Never synced"}
            </span>
            <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(undefined)}>
              <RefreshCw className={sync.isPending ? "animate-spin" : undefined} />
              Sync
            </Button>
          </div>
        </div>
        {sync.error || status.lastSyncError ? (
          <p className="mb-4 text-sm text-destructive">{sync.error ? errorMessage(sync.error) : status.lastSyncError}</p>
        ) : null}
        {type === "prs" ? <GithubPrList /> : <GithubIssueList />}
      </PageSection>
    </>
  )
}
