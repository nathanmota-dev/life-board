import { Panel, Status } from "@/components/workspace-ui"

export function AboutPanel() {
  return (
    <Panel title="About Life Board">
      <div className="mb-3">
        <Status value="Local" />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Life Board is your personal board for tasks, calendar, goals, GitHub, habits and everything else you want to keep
        track of. Everything is stored on this computer.
      </p>
    </Panel>
  )
}
