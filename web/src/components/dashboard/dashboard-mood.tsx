import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Smile } from "lucide-react"
import { DaySummary } from "@/components/dashboard/day-summary"
import { MoodCheckIn } from "@/components/mood/mood-check-in"
import { DataState } from "@/components/shared/data-state"
import { Panel } from "@/components/workspace-ui"
import { useMoodToday } from "@/hooks/queries/use-mood"
import type { MoodWidgetBodyProps } from "@/types/dashboard"

function MoodWidgetBody({ today }: MoodWidgetBodyProps) {
  const [editing, setEditing] = useState(false)

  return today.entry && !editing ? <DaySummary entry={today.entry} onChange={() => setEditing(true)} /> : <MoodCheckIn today={today} />
}

/** The mood check-in; once today's mood is saved, the day's summary with an option to change it. */
export function DashboardMood() {
  const { t } = useTranslation()
  const today = useMoodToday()

  return (
    <Panel title={t("dashboard.widgets.mood")} icon={Smile}>
      <DataState isLoading={today.isLoading} error={today.error}>
        {/* A new save changes the key, closing the editor and showing the summary again. */}
        {today.data ? <MoodWidgetBody key={today.data.entry?.updatedAt ?? today.data.day} today={today.data} /> : null}
      </DataState>
    </Panel>
  )
}
