import { AboutPanel } from "@/components/settings/about-panel"
import { AccentPanel } from "@/components/settings/accent-panel"
import { AppearancePanel } from "@/components/settings/appearance-panel"
import { GithubTokenPanel } from "@/components/settings/github-token-panel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Page, PageSection } from "@/components/workspace-ui"

export function SettingsPage() {
  return (
    <Page title="Settings" description="A workspace that feels like yours.">
      <PageSection>
        <Tabs defaultValue="general">
          <TabsList aria-label="Settings views">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="github">GitHub</TabsTrigger>
          </TabsList>
          <TabsContent value="general">
            <div className="grid gap-4 lg:grid-cols-2">
              <AppearancePanel />
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
