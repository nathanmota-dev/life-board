import { useTranslation } from "react-i18next"
import { GithubPrRow } from "@/components/github/github-pr-row"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { GithubPrTableProps } from "@/types/github"

export function GithubPrTable({ prs }: GithubPrTableProps) {
  const { t } = useTranslation()
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">{t("github.pullRequest")}</TableHead>
            <TableHead>{t("github.why")}</TableHead>
            <TableHead>{t("github.state")}</TableHead>
            <TableHead>{t("github.changes")}</TableHead>
            <TableHead>{t("common.updated")}</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">{t("common.open")}</span>
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
