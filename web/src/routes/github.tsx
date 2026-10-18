import { useTranslation } from "react-i18next"
import { GithubConnectPrompt } from "@/components/github/github-connect-prompt"
import { GithubDashboard } from "@/components/github/github-dashboard"
import { DataState } from "@/components/shared/data-state"
import { Page, PageSection } from "@/components/workspace-ui"
import { useGithubStatus } from "@/hooks/queries/use-github"

export function GitHubPage() {
  const { t } = useTranslation()
  const status = useGithubStatus()

  return (
    <Page title={t("navigation.github")} description={t("github.description")}>
      <DataState isLoading={status.isLoading} error={status.error} loading={<PageSection>{t("common.loadingEllipsis")}</PageSection>}>
        {status.data?.connected ? <GithubDashboard status={status.data} /> : <GithubConnectPrompt />}
      </DataState>
    </Page>
  )
}
