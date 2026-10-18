import { Link } from "@tanstack/react-router"
import { ArrowUpRight, FolderGit2, GitBranch } from "lucide-react"
import { ContributionsCalendar } from "@/components/github/contributions-calendar"
import { RecentRepos } from "@/components/github/recent-repos"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/workspace-ui"
import { useGithubStatus } from "@/hooks/queries/use-github"

const connectPrompt = (
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
)

/** Contributions grid and recently contributed repositories, side by side on wide windows. */
export function GithubActivityPanel() {
  const status = useGithubStatus()
  const connected = status.data?.connected === true

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <Panel
        title="GitHub contributions"
        icon={GitBranch}
        className="xl:col-span-8"
        action={
          <Button variant="outline" size="icon-sm" aria-label="Open GitHub page" asChild>
            <Link to="/github">
              <ArrowUpRight />
            </Link>
          </Button>
        }
      >
        {connected ? <ContributionsCalendar enabled /> : connectPrompt}
      </Panel>
      <Panel title="Recent repositories" icon={FolderGit2} className="xl:col-span-4">
        {connected ? <RecentRepos enabled /> : <EmptyState icon={FolderGit2} title="Not connected" className="py-6" />}
      </Panel>
    </div>
  )
}
