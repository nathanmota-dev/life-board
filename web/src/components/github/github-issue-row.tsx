import { ExternalLink } from "lucide-react"
import { Status } from "@/components/workspace-ui"
import { Button } from "@/components/ui/button"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatRelativeDay } from "@/lib/dates"
import { openExternal } from "@/lib/external"
import { kindLabel } from "@/lib/github"
import type { GithubIssueRowProps } from "@/types/github"

const MAX_LABELS = 3

export function GithubIssueRow({ issue }: GithubIssueRowProps) {
  return (
    <TableRow>
      <TableCell className="max-w-0 min-w-64 pl-4">
        <div className="flex items-center gap-3">
          {issue.authorAvatarUrl ? (
            <img src={issue.authorAvatarUrl} alt="" className="size-7 shrink-0 rounded-full" />
          ) : (
            <span className="size-7 shrink-0 rounded-full bg-muted" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{issue.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {issue.repoOwner}/{issue.repoName}#{issue.number}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{kindLabel(issue.kind)}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {issue.labels.slice(0, MAX_LABELS).map((label) => (
            <Status key={label} value={label} />
          ))}
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground tabular-nums">{issue.comments}</TableCell>
      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">{formatRelativeDay(issue.updatedAt)}</TableCell>
      <TableCell className="w-10 pr-3">
        <Button variant="ghost" size="icon-sm" aria-label={`Open ${issue.title} on GitHub`} onClick={() => openExternal(issue.url)}>
          <ExternalLink />
        </Button>
      </TableCell>
    </TableRow>
  )
}
