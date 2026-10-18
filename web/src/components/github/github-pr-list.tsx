import { useTranslation } from "react-i18next"
import { useState } from "react"
import { GitPullRequest } from "lucide-react"
import { GithubPrTable } from "@/components/github/github-pr-table"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { useGithubPrs } from "@/hooks/queries/use-github"
import { getGithubKindOptions } from "@/lib/github"
import type { GithubView } from "@/types/github"

export function GithubPrList() {
  const { t } = useTranslation()
  const [view, setView] = useState<GithubView>("all")
  const prs = useGithubPrs(view === "all" ? undefined : view)
  const items = prs.data ?? []

  return (
    <>
      <div className="mb-4">
        <SegmentedControl label={t("github.prViews")} value={view} onChange={setView} options={[{ value: "all", label: t("common.all") }, ...getGithubKindOptions()]} />
      </div>
      <DataState
        isLoading={prs.isLoading}
        error={prs.error}
        isEmpty={items.length === 0}
        empty={<EmptyState icon={GitPullRequest} title={t("github.noPrs")} description={t("github.noPrsDescription")} />}
      >
        <GithubPrTable prs={items} />
      </DataState>
    </>
  )
}
