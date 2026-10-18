import { useTranslation } from "react-i18next"
import { useState } from "react"
import { CircleDot } from "lucide-react"
import { GithubIssueTable } from "@/components/github/github-issue-table"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { useGithubIssues } from "@/hooks/queries/use-github"
import { getGithubIssueKindOptions } from "@/lib/github"
import type { GithubIssueView } from "@/types/github"

export function GithubIssueList() {
  const { t } = useTranslation()
  const [view, setView] = useState<GithubIssueView>("all")
  const issues = useGithubIssues(view === "all" ? undefined : view)
  const items = issues.data ?? []

  return (
    <>
      <div className="mb-4">
        <SegmentedControl label={t("github.issueViews")} value={view} onChange={setView} options={[{ value: "all", label: t("common.all") }, ...getGithubIssueKindOptions()]} />
      </div>
      <DataState
        isLoading={issues.isLoading}
        error={issues.error}
        isEmpty={items.length === 0}
        empty={<EmptyState icon={CircleDot} title={t("github.noIssues")} description={t("github.noIssuesDescription")} />}
      >
        <GithubIssueTable issues={items} />
      </DataState>
    </>
  )
}
