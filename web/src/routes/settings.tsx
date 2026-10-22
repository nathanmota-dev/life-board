import { useEffect, useState } from "react"
import { useLocation, useRouter } from "@tanstack/react-router"
import { UpdatesPanel } from "@/components/settings/updates-panel"
import { useTranslation } from "react-i18next"
import { AccentPanel } from "@/components/settings/accent-panel"
import { AppearancePanel } from "@/components/settings/appearance-panel"
import { FilesPanel } from "@/components/settings/files-panel"
import { GithubTokenPanel } from "@/components/settings/github-token-panel"
import { LanguagePanel } from "@/components/settings/language-panel"
import { StartupPanel } from "@/components/settings/startup-panel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Page, PageSection } from "@/components/workspace-ui"

export function SettingsPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const router = useRouter()
  const tab = location.search.tab
  const [selected, setSelected] = useState<string>(tab ?? "general")
  useEffect(() => { setSelected(tab ?? "general") }, [tab])

  return (
    <Page title={t("navigation.settings")} description={t("settings.description")}>
      <PageSection>
        <Tabs value={selected} onValueChange={(value) => {
          setSelected(value)
          router.history.replace(`${location.pathname}?tab=${value}`)
        }}>
          <TabsList aria-label={t("settings.views")}>
            <TabsTrigger value="general">{t("settings.general")}</TabsTrigger>
            <TabsTrigger value="files">{t("settings.files.tab")}</TabsTrigger>
            <TabsTrigger value="updates">{t("settings.updates.title")}</TabsTrigger>
            <TabsTrigger value="github">{t("navigation.github")}</TabsTrigger>
          </TabsList>
          <TabsContent value="general">
            <div className="grid gap-4 lg:grid-cols-2">
              <AppearancePanel />
              <LanguagePanel />
              <AccentPanel />
              <StartupPanel />
            </div>
          </TabsContent>
          <TabsContent value="files">
            <FilesPanel />
          </TabsContent>
          <TabsContent value="updates">
            <UpdatesPanel />
          </TabsContent>
          <TabsContent value="github">
            <GithubTokenPanel />
          </TabsContent>
        </Tabs>
      </PageSection>
    </Page>
  )
}
