import type { ComponentType } from "react"
import { DashboardGoals } from "@/components/dashboard/dashboard-goals"
import { DashboardHabits } from "@/components/dashboard/dashboard-habits"
import { DashboardMood } from "@/components/dashboard/dashboard-mood"
import { FocusTasks } from "@/components/dashboard/focus-tasks"
import { MyDayTimeline } from "@/components/dashboard/my-day-timeline"
import { cn } from "@/lib/utils"
import type { DashboardWidgetId, DashboardWidgetProps } from "@/types/dashboard"

const WIDGETS: Record<DashboardWidgetId, ComponentType> = {
  myDay: MyDayTimeline,
  focus: FocusTasks,
  habits: DashboardHabits,
  mood: DashboardMood,
  goals: DashboardGoals,
}

/** A grid cell; as a grid item of its own, the widget stretches to the height of the widget beside it. */
export function DashboardWidget({ id, fullRow }: DashboardWidgetProps) {
  const Widget = WIDGETS[id]

  return (
    <div className={cn("grid min-w-0", fullRow && "xl:col-span-2")}>
      <Widget />
    </div>
  )
}
