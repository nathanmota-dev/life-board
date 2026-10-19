import { useTranslation } from "react-i18next"
import { Link } from "@tanstack/react-router"
import { ArrowUpRight, FolderGit2, GitBranch } from "lucide-react"
import { ContributionsCalendar } from "@/components/github/contributions-calendar"
import { RecentRepos } from "@/components/github/recent-repos"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/workspace-ui"
import { useGithubStatus } from "@/hooks/queries/use-github"

function ConnectPrompt() {
  const { t } = useTranslation()

  return (
    <EmptyState
      icon={GitBranch}
      title={t("dashboard.connectGithub")}
      description={t("dashboard.addToken")}
      className="py-6"
      action={
        <Button size="sm" variant="outline" asChild>
          <Link to="/settings">{t("common.openSettings")}</Link>
        </Button>
      }
    />
  )
}

/** Contributions grid and recently contributed repositories, side by side on wide windows. */
export function GithubActivityPanel() {
  const { t } = useTranslation()
  const status = useGithubStatus()
  const connected = status.data?.connected === true

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <Panel
        title={t("dashboard.githubContributions")}
        icon={GitBranch}
        className="xl:col-span-8"
        action={
          <Button variant="outline" size="icon-sm" aria-label={t("dashboard.openGithub")} asChild>
            <Link to="/github">
              <ArrowUpRight />
            </Link>
          </Button>
        }
      >
        <DataState isLoading={status.isLoading} error={status.error}>
          {connected ? <ContributionsCalendar enabled /> : <ConnectPrompt />}
        </DataState>
      </Panel>
      <Panel title={t("dashboard.recentRepositories")} icon={FolderGit2} className="xl:col-span-4">
        <DataState isLoading={status.isLoading} error={status.error}>
          {connected ? <RecentRepos enabled /> : <EmptyState icon={FolderGit2} title={t("dashboard.notConnected")} className="py-6" />}
        </DataState>
      </Panel>
    </div>
  )
}
