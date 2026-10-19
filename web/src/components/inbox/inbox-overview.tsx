import { useTranslation } from "react-i18next"
import { Inbox, Lightbulb } from "lucide-react"
import { CaptureShortcutHint } from "@/components/inbox/capture-shortcut-hint"
import { InboxTaskList } from "@/components/inbox/inbox-task-list"
import { QuickCapture } from "@/components/inbox/quick-capture"
import { RecentThoughts } from "@/components/inbox/recent-thoughts"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { PageSection, Panel } from "@/components/workspace-ui"
import { useThoughts } from "@/hooks/queries/use-thoughts"
import type { InboxOverviewProps } from "@/types/inbox"

export function InboxOverview({ tasks, isLoading, error }: InboxOverviewProps) {
  const { t } = useTranslation()
  const thoughts = useThoughts({ limit: 5 })
  const recent = (thoughts.data ?? []).slice(0, 5)

  return (
    <>
      <PageSection>
        <QuickCapture />
        <CaptureShortcutHint />
      </PageSection>
      <PageSection>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Panel title={t("inbox.toTriage")} icon={Inbox} action={<span className="text-xs text-muted-foreground">{t("counts.item", { count: tasks.length })}</span>}>
            <DataState
              isLoading={isLoading}
              error={error}
              isEmpty={tasks.length === 0}
              empty={<EmptyState icon={Inbox} title={t("inbox.zero")} description={t("inbox.emptyDescription")} />}
            >
              <InboxTaskList tasks={tasks} />
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
    </>
  )
}
