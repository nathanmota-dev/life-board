import { Link } from "@tanstack/react-router"
import { GitPullRequest } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { PageSection } from "@/components/workspace-ui"

export function GithubConnectPrompt() {
  return (
    <PageSection>
      <EmptyState
        icon={GitPullRequest}
        title="Connect your GitHub account"
        description="Add a personal access token in Settings to follow your pull requests and contributions."
        action={
          <Button size="sm" asChild>
            <Link to="/settings">Open Settings</Link>
          </Button>
        }
      />
    </PageSection>
  )
}
