import { useTheme } from "@/components/theme-provider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Page, Panel, Status } from "@/components/workspace-ui"

function AppearancePanel() {
  const { theme, setTheme } = useTheme()
  return (
    <Panel title="Appearance">
      <p className="mb-4 text-sm text-muted-foreground">
        Choose the theme that works best for you.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(["light", "dark"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => setTheme(value)}
            className={`cursor-pointer rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-ring ${theme === value ? "border-chart-1 ring-1 ring-chart-1" : "border-border"}`}
          >
            <div
              className={`mb-3 flex h-24 gap-2 rounded-md border p-2 ${value === "dark" ? "bg-zinc-900" : "bg-zinc-50"}`}
            >
              <div
                className={`w-1/4 rounded ${value === "dark" ? "bg-zinc-800" : "bg-zinc-200"}`}
              />
              <div className="flex flex-1 flex-col gap-2">
                <div
                  className={`h-3 rounded ${value === "dark" ? "bg-zinc-700" : "bg-zinc-200"}`}
                />
                <div
                  className={`flex-1 rounded ${value === "dark" ? "bg-zinc-800" : "bg-white"}`}
                />
              </div>
            </div>
            <span className="text-sm capitalize">{value}</span>
          </button>
        ))}
      </div>
    </Panel>
  )
}

function AboutPanel() {
  return (
    <Panel title="About Life Board">
      <div className="mb-3">
        <Status value="Local" />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Life Board is your personal board for tasks, calendar, goals, GitHub,
        habits and everything else you want to keep track of.
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        More settings will appear here as new features arrive.
      </p>
    </Panel>
  )
}

export function SettingsPage() {
  return (
    <Page title="Settings" description="A workspace that feels like yours.">
      <Tabs defaultValue="general">
        <TabsList aria-label="Settings views">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <div className="grid gap-4 lg:grid-cols-2">
            <AppearancePanel />
            <AboutPanel />
          </div>
        </TabsContent>
        <TabsContent value="profile" />
      </Tabs>
    </Page>
  )
}
