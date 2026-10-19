import { useTranslation } from "react-i18next"
import { useState } from "react"
import { ListChecks } from "lucide-react"
import { InboxOverview } from "@/components/inbox/inbox-overview"
import { TriageView } from "@/components/inbox/triage-view"
import { Button } from "@/components/ui/button"
import { Page } from "@/components/workspace-ui"
import { useTasks } from "@/hooks/queries/use-tasks"

export function InboxPage() {
  const { t } = useTranslation()
  const [triaging, setTriaging] = useState(false)
  const tasks = useTasks({ status: "inbox", limit: 100 })
  const inbox = tasks.data ?? []

  return (
    <Page
      title={t("navigation.inbox")}
      description={t("inbox.description")}
      actions={
        triaging ? null : (
          <Button size="sm" disabled={inbox.length === 0} onClick={() => setTriaging(true)}>
            <ListChecks />
            {t("inbox.triage")}
          </Button>
        )
      }
    >
      {triaging ? (
        <TriageView tasks={inbox} onExit={() => setTriaging(false)} />
      ) : (
        <InboxOverview tasks={inbox} isLoading={tasks.isLoading} error={tasks.error} />
      )}
    </Page>
  )
}
