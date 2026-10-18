import { GitBranch } from "lucide-react"
import { DataState } from "@/components/shared/data-state"
import { GithubConnected } from "@/components/settings/github-connected"
import { GithubTokenForm } from "@/components/settings/github-token-form"
import { Panel } from "@/components/workspace-ui"
import { useGithubStatus } from "@/hooks/queries/use-github"

export function GithubTokenPanel() {
  const status = useGithubStatus()

  return (
    <Panel title="GitHub" icon={GitBranch} className="max-w-2xl">
      <DataState isLoading={status.isLoading} error={status.error}>
        {status.data?.connected ? <GithubConnected status={status.data} /> : <GithubTokenForm />}
      </DataState>
    </Panel>
  )
}
