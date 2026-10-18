import { GithubPrRow } from "@/components/github/github-pr-row"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { GithubPrTableProps } from "@/types/github"

export function GithubPrTable({ prs }: GithubPrTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Pull request</TableHead>
            <TableHead>Why</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Changes</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Open</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prs.map((pr) => (
            <GithubPrRow key={pr.id} pr={pr} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
