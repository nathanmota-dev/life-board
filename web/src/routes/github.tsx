import { GithubConnectPrompt } from "@/components/github/github-connect-prompt"
import { GithubDashboard } from "@/components/github/github-dashboard"
import { DataState } from "@/components/shared/data-state"
import { Page, PageSection } from "@/components/workspace-ui"
import { useGithubStatus } from "@/hooks/queries/use-github"

export function GitHubPage() {
  const status = useGithubStatus()

  return (
    <Page title="GitHub" description="Pull requests and issues to follow up on, and your contributions.">
      <DataState isLoading={status.isLoading} error={status.error} loading={<PageSection>Loading…</PageSection>}>
        {status.data?.connected ? <GithubDashboard status={status.data} /> : <GithubConnectPrompt />}
      </DataState>
    </Page>
  )
}
