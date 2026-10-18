import { useTranslation } from "react-i18next"
import { AboutPanel } from "@/components/settings/about-panel"
import { AccentPanel } from "@/components/settings/accent-panel"
import { AppearancePanel } from "@/components/settings/appearance-panel"
import { GithubTokenPanel } from "@/components/settings/github-token-panel"
import { LanguagePanel } from "@/components/settings/language-panel"
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
            <TabsTrigger value="profile">{t("settings.profile")}</TabsTrigger>
            <TabsTrigger value="github">{t("navigation.github")}</TabsTrigger>
          </TabsList>
          <TabsContent value="general">
            <div className="grid gap-4 lg:grid-cols-2">
              <AppearancePanel />
              <LanguagePanel />
              <AccentPanel />
              <AboutPanel />
            </div>
          </TabsContent>
          <TabsContent value="profile" />
          <TabsContent value="github">
            <GithubTokenPanel />
          </TabsContent>
        </Tabs>
      </PageSection>
    </Page>
  )
}
