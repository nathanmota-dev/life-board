import { useTranslation } from "react-i18next"
import { Inbox, Lightbulb } from "lucide-react"
import { InboxTaskList } from "@/components/inbox/inbox-task-list"
import { QuickCapture } from "@/components/inbox/quick-capture"
import { RecentThoughts } from "@/components/inbox/recent-thoughts"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Page, PageSection, Panel } from "@/components/workspace-ui"
import { useTasks } from "@/hooks/queries/use-tasks"
import { useThoughts } from "@/hooks/queries/use-thoughts"

export function InboxPage() {
  const { t } = useTranslation()
  const tasks = useTasks({ status: "inbox", limit: 100 })
  const thoughts = useThoughts({ limit: 5 })
  const inbox = tasks.data ?? []
  const recent = (thoughts.data ?? []).slice(0, 5)

  return (
    <Page title={t("navigation.inbox")} description={t("inbox.description")}>
      <PageSection>
        <QuickCapture />
      </PageSection>
      <PageSection>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Panel title={t("inbox.toTriage")} icon={Inbox} action={<span className="text-xs text-muted-foreground">{t("counts.item", { count: inbox.length })}</span>}>
            <DataState
              isLoading={tasks.isLoading}
              error={tasks.error}
              isEmpty={inbox.length === 0}
              empty={<EmptyState icon={Inbox} title={t("inbox.zero")} description={t("inbox.emptyDescription")} />}
            >
              <InboxTaskList tasks={inbox} />
            </DataState>
          </Panel>
          <Panel title={t("inbox.recentThoughts")} icon={Lightbulb}>
            <DataState
              isLoading={thoughts.isLoading}
              error={thoughts.error}
              isEmpty={recent.length === 0}
              empty={<EmptyState icon={Lightbulb} title={t("thoughts.empty")} />}
            >
              <RecentThoughts thoughts={recent} />
            </DataState>
          </Panel>
        </div>
      </PageSection>
    </Page>
  )
}
