import { useTranslation } from "react-i18next"
import { AccentPanel } from "@/components/settings/accent-panel"
import { AppearancePanel } from "@/components/settings/appearance-panel"
import { GithubTokenPanel } from "@/components/settings/github-token-panel"
import { LanguagePanel } from "@/components/settings/language-panel"
import { StartupPanel } from "@/components/settings/startup-panel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Page, PageSection } from "@/components/workspace-ui"

export function SettingsPage() {
  const { t } = useTranslation()

  return (
    <Page title={t("navigation.settings")} description={t("settings.description")}>
      <PageSection>
        <Tabs defaultValue="general">
          <TabsList aria-label={t("settings.views")}>
            <TabsTrigger value="general">{t("settings.general")}</TabsTrigger>
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
          <TabsContent value="github">
            <GithubTokenPanel />
          </TabsContent>
        </Tabs>
      </PageSection>
    </Page>
  )
}
