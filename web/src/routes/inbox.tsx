import { Inbox, Lightbulb } from "lucide-react"
import { InboxTaskList } from "@/components/inbox/inbox-task-list"
import { QuickCapture } from "@/components/inbox/quick-capture"
import { RecentThoughts } from "@/components/inbox/recent-thoughts"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Page, PageSection, Panel } from "@/components/workspace-ui"
import { useTasks } from "@/hooks/queries/use-tasks"
import { useThoughts } from "@/hooks/queries/use-thoughts"
import { pluralize } from "@/lib/format"

export function InboxPage() {
  const tasks = useTasks({ status: "inbox", limit: 100 })
  const thoughts = useThoughts({ limit: 5 })
  const inbox = tasks.data ?? []
  const recent = (thoughts.data ?? []).slice(0, 5)

  return (
    <Page title="Inbox" description="Capture first, sort it out later.">
      <PageSection>
        <QuickCapture />
      </PageSection>
      <PageSection>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Panel title="To triage" icon={Inbox} action={<span className="text-xs text-muted-foreground">{pluralize(inbox.length, "item")}</span>}>
            <DataState
              isLoading={tasks.isLoading}
              error={tasks.error}
              isEmpty={inbox.length === 0}
              empty={<EmptyState icon={Inbox} title="Inbox zero" description="Everything you capture lands here until you plan it." />}
            >
              <InboxTaskList tasks={inbox} />
            </DataState>
          </Panel>
          <Panel title="Recent thoughts" icon={Lightbulb}>
            <DataState
              isLoading={thoughts.isLoading}
              error={thoughts.error}
              isEmpty={recent.length === 0}
              empty={<EmptyState icon={Lightbulb} title="No thoughts yet" />}
            >
              <RecentThoughts thoughts={recent} />
            </DataState>
          </Panel>
        </div>
      </PageSection>
    </Page>
  )
}
