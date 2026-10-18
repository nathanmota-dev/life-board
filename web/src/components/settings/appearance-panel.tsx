import { useTheme } from "@/components/theme-provider"
import { Panel } from "@/components/workspace-ui"
import { cn } from "@/lib/utils"

export function AppearancePanel() {
  const { theme, setTheme } = useTheme()

  return (
    <Panel title="Appearance">
      <p className="mb-4 text-sm text-muted-foreground">Choose the theme that works best for you.</p>
      <div className="grid grid-cols-2 gap-3">
        {(["light", "dark"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => setTheme(value)}
            className={cn(
              "cursor-pointer rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-ring",
              theme === value ? "border-primary ring-1 ring-primary" : "border-border",
            )}
          >
            <div className={cn("mb-3 flex h-24 gap-2 rounded-md border p-2", value === "dark" ? "bg-zinc-900" : "bg-zinc-50")}>
              <div className={cn("w-1/4 rounded", value === "dark" ? "bg-zinc-800" : "bg-zinc-200")} />
              <div className="flex flex-1 flex-col gap-2">
                <div className={cn("h-3 rounded", value === "dark" ? "bg-zinc-700" : "bg-zinc-200")} />
                <div className={cn("flex-1 rounded", value === "dark" ? "bg-zinc-800" : "bg-white")} />
              </div>
            </div>
            <span className="text-sm capitalize">{value}</span>
          </button>
        ))}
      </div>
    </Panel>
  )
}
