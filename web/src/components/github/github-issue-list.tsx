import { useState } from "react"
import { CircleDot } from "lucide-react"
import { GithubIssueTable } from "@/components/github/github-issue-table"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { useGithubIssues } from "@/hooks/queries/use-github"
import { ISSUE_KIND_OPTIONS } from "@/lib/github"
import type { GithubIssueView } from "@/types/github"

export function GithubIssueList() {
  const [view, setView] = useState<GithubIssueView>("all")
  const issues = useGithubIssues(view === "all" ? undefined : view)
  const items = issues.data ?? []

  return (
    <>
      <div className="mb-4">
        <SegmentedControl label="Issue views" value={view} onChange={setView} options={[{ value: "all", label: "All" }, ...ISSUE_KIND_OPTIONS]} />
      </div>
      <DataState
        isLoading={issues.isLoading}
        error={issues.error}
        isEmpty={items.length === 0}
        empty={<EmptyState icon={CircleDot} title="No issues" description="No open issues involve you right now." />}
      >
        <GithubIssueTable issues={items} />
      </DataState>
    </>
  )
}
