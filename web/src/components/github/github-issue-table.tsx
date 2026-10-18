import { useTranslation } from "react-i18next"
import { GithubIssueRow } from "@/components/github/github-issue-row"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { GithubIssueTableProps } from "@/types/github"

export function GithubIssueTable({ issues }: GithubIssueTableProps) {
  const { t } = useTranslation()
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">{t("github.issue")}</TableHead>
            <TableHead>{t("github.why")}</TableHead>
            <TableHead>{t("github.labels")}</TableHead>
            <TableHead>{t("github.comments")}</TableHead>
            <TableHead>{t("common.updated")}</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">{t("common.open")}</span>
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
