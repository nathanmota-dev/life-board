import { Link } from "@tanstack/react-router"
import { ArrowUpRight, GitBranch } from "lucide-react"
import { ContributionsCalendar } from "@/components/github/contributions-calendar"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/workspace-ui"
import { useGithubStatus } from "@/hooks/queries/use-github"

export function GithubActivityPanel() {
  const status = useGithubStatus()
  const connected = status.data?.connected === true

  return (
    <Panel
      title="GitHub contributions"
      icon={GitBranch}
      action={
        <Button variant="outline" size="icon-sm" aria-label="Open GitHub page" asChild>
          <Link to="/github">
            <ArrowUpRight />
          </Link>
        </Button>
      }
    >
      {connected ? (
        <ContributionsCalendar enabled />
      ) : (
        <EmptyState
          icon={GitBranch}
          title="Connect GitHub to see your contributions"
          description="Add a personal access token in Settings."
          className="py-6"
          action={
            <Button size="sm" variant="outline" asChild>
              <Link to="/settings">Open Settings</Link>
            </Button>
          }
        />
      )}
    </Panel>
  )
}
