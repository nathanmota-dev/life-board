import { useState } from "react"
import { GitPullRequest } from "lucide-react"
import { GithubPrTable } from "@/components/github/github-pr-table"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { useGithubPrs } from "@/hooks/queries/use-github"
import { KIND_OPTIONS } from "@/lib/github"
import type { GithubView } from "@/types/github"

export function GithubPrList() {
  const [view, setView] = useState<GithubView>("all")
  const prs = useGithubPrs(view === "all" ? undefined : view)
  const items = prs.data ?? []

  return (
    <>
      <div className="mb-4">
        <SegmentedControl label="Pull request views" value={view} onChange={setView} options={[{ value: "all", label: "All" }, ...KIND_OPTIONS]} />
      </div>
      <DataState
        isLoading={prs.isLoading}
        error={prs.error}
        isEmpty={items.length === 0}
        empty={<EmptyState icon={GitPullRequest} title="No pull requests" description="No open PRs involve you right now." />}
      >
        <GithubPrTable prs={items} />
      </DataState>
    </>
  )
}
