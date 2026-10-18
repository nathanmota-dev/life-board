import { FolderGit2 } from "lucide-react"
import { RecentRepoCard } from "@/components/github/recent-repo-card"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useRecentRepos } from "@/hooks/queries/use-github"
import type { RecentReposProps } from "@/types/github"

const loading = (
  <div className="grid grid-cols-2 gap-3">
    {[0, 1, 2, 3].map((index) => (
      <Skeleton key={index} className="h-16 rounded-xl" />
    ))}
  </div>
)

/** The repositories the connected account contributed to most recently, as a 2×2 grid of cards. */
export function RecentRepos({ enabled }: RecentReposProps) {
  const repos = useRecentRepos(enabled)

  return (
    <DataState
      isLoading={repos.isLoading}
      error={repos.error}
      isEmpty={repos.data?.length === 0}
      empty={<EmptyState icon={FolderGit2} title="No recent repositories" className="py-6" />}
      loading={loading}
    >
      <div className="grid h-full grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
        {repos.data?.map((repo) => <RecentRepoCard key={repo.fullName} repo={repo} />)}
      </div>
    </DataState>
  )
}
