import { ExternalLink } from "lucide-react"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatRelativeDay } from "@/lib/dates"
import { openExternal } from "@/lib/external"
import { kindLabel, PR_STATE_TONES, prStateLabel } from "@/lib/github"
import type { GithubPrRowProps } from "@/types/github"

export function GithubPrRow({ pr }: GithubPrRowProps) {
  return (
    <TableRow>
      <TableCell className="max-w-0 min-w-64 pl-4">
        <div className="flex items-center gap-3">
          {pr.authorAvatarUrl ? (
            <img src={pr.authorAvatarUrl} alt="" className="size-7 shrink-0 rounded-full" />
          ) : (
            <span className="size-7 shrink-0 rounded-full bg-muted" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{pr.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {pr.repoOwner}/{pr.repoName}#{pr.number}
              {pr.headBranch ? ` · ${pr.headBranch}` : ""}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{kindLabel(pr.kind)}</TableCell>
      <TableCell>
        <StatusBadge label={prStateLabel(pr)} tone={pr.draft ? "neutral" : PR_STATE_TONES[pr.state]} />
      </TableCell>
      <TableCell className="text-xs whitespace-nowrap tabular-nums">
        <span className="text-success">+{pr.additions}</span> <span className="text-destructive">−{pr.deletions}</span>
      </TableCell>
      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">{formatRelativeDay(pr.updatedAt)}</TableCell>
      <TableCell className="w-10 pr-3">
        <Button variant="ghost" size="icon-sm" aria-label={`Open ${pr.title} on GitHub`} onClick={() => openExternal(pr.url)}>
          <ExternalLink />
        </Button>
      </TableCell>
    </TableRow>
  )
}
