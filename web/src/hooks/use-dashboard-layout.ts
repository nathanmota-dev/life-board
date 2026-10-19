import { useState } from "react"
import { defaultDashboardLayout, moveWidget, readDashboardLayout, saveDashboardLayout, toggleWidget } from "@/lib/dashboard"
import type { DashboardLayout, DashboardWidgetId } from "@/types/dashboard"

/** The dashboard's widget layout, saved in localStorage on every change. */
export function useDashboardLayout() {
  const [layout, setLayout] = useState(readDashboardLayout)
  const apply = (next: DashboardLayout) => {
    setLayout(next)
    saveDashboardLayout(next)
  }

  return {
    layout,
    toggle: (id: DashboardWidgetId) => apply(toggleWidget(layout, id)),
    move: (id: DashboardWidgetId, offset: -1 | 1) => apply(moveWidget(layout, id, offset)),
    reset: () => apply(defaultDashboardLayout()),
  }
}
