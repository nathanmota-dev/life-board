import { Lock } from "lucide-react"
import { formatDate } from "@/lib/dates"
import { openExternal } from "@/lib/external"
import type { RecentRepoCardProps } from "@/types/github"

export function RecentRepoCard({ repo }: RecentRepoCardProps) {
  const [owner, name] = repo.fullName.split("/")

  return (
    <button
      type="button"
      title={repo.description ?? repo.fullName}
      onClick={() => openExternal(repo.url)}
      className="flex min-w-0 flex-col justify-between gap-2 rounded-xl border bg-muted/30 p-3 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{name}</span>
          {repo.private ? <Lock className="size-3 shrink-0 text-muted-foreground" aria-label="Private" /> : null}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{owner}</span>
      </span>
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          {repo.language ? (
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: repo.languageColor ?? "var(--muted-foreground)" }} />
          ) : null}
          <span className="truncate">{repo.language ?? "—"}</span>
        </span>
        <span className="shrink-0">{formatDate(repo.lastContributedAt)}</span>
      </span>
    </button>
  )
}
