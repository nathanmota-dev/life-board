import { useTranslation } from "react-i18next"
import { Smile } from "lucide-react"
import { MoodCheckIn } from "@/components/mood/mood-check-in"
import { MoodEntries } from "@/components/mood/mood-entries"
import { MoodStats } from "@/components/mood/mood-stats"
import { MoodTrendChart } from "@/components/mood/mood-trend-chart"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Page, PageSection, Panel } from "@/components/workspace-ui"
import { useMoodEntries, useMoodToday } from "@/hooks/queries/use-mood"

export function MoodPage() {
  const { t } = useTranslation()
  const today = useMoodToday()
  const entries = useMoodEntries(90)
  const items = entries.data ?? []

  return (
    <Page title={t("navigation.mood")} description={t("mood.description")}>
      <PageSection>
        <MoodStats entries={items} today={today.data} />
      </PageSection>
      <PageSection>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Panel title={t("mood.howAreYou")}>
            <DataState isLoading={today.isLoading} error={today.error}>
              {today.data ? <MoodCheckIn key={today.data.entry?.updatedAt ?? today.data.day} today={today.data} /> : null}
            </DataState>
          </Panel>
          <Panel title={t("common.last30Days")}>
            <MoodTrendChart entries={items} />
          </Panel>
        </div>
      </PageSection>
      <PageSection title={t("mood.history")}>
        <DataState
          isLoading={entries.isLoading}
          error={entries.error}
          isEmpty={items.length === 0}
          empty={<EmptyState icon={Smile} title={t("mood.empty")} description={t("mood.emptyDescription")} />}
        >
          <MoodEntries entries={items} />
        </DataState>
      </PageSection>
    </Page>
  )
}
