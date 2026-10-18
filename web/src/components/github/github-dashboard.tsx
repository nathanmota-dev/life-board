import { useTranslation } from "react-i18next"
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
import { getGithubItemTypeOptions } from "@/lib/github"
import type { GithubDashboardProps, GithubItemType } from "@/types/github"

export function GithubDashboard({ status }: GithubDashboardProps) {
  const { t } = useTranslation()
  const [type, setType] = useState<GithubItemType>("prs")
  const sync = useAutoSyncGithub()

  return (
    <>
      <PageSection>
        <Panel title={`@${status.login}`} action={<span className="text-xs text-muted-foreground">{t("github.contributions")}</span>}>
          <ContributionsCalendar enabled />
        </Panel>
      </PageSection>
      <PageSection>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl label={t("github.itemType")} value={type} onChange={setType} options={getGithubItemTypeOptions()} />
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {sync.isPending ? t("github.syncing") : status.lastSyncAt ? t("github.syncedOn", { date: formatRelativeDay(status.lastSyncAt) }) : t("github.neverSynced")}
            </span>
            <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(undefined)}>
              <RefreshCw className={sync.isPending ? "animate-spin" : undefined} />
              {t("github.sync")}
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
