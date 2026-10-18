import { GithubIssueRow } from "@/components/github/github-issue-row"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { GithubIssueTableProps } from "@/types/github"

export function GithubIssueTable({ issues }: GithubIssueTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Issue</TableHead>
            <TableHead>Why</TableHead>
            <TableHead>Labels</TableHead>
            <TableHead>Comments</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Open</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue) => (
            <GithubIssueRow key={issue.id} issue={issue} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
