import { useTranslation } from "react-i18next"
import { ArrowDown, ArrowUp, RotateCcw, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { widgetLabel } from "@/lib/dashboard"
import type { DashboardCustomizeMenuProps } from "@/types/dashboard"

/** Shows, hides and reorders the dashboard widgets, and turns the quick capture bar on or off. */
export function DashboardCustomizeMenu({ layout, onToggle, onMove, onToggleQuickCapture, onReset }: DashboardCustomizeMenuProps) {
  const { t } = useTranslation()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <SlidersHorizontal />
          {t("dashboard.customize")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] p-2">
        <p className="px-2 py-1.5 text-sm font-medium">{t("dashboard.customizeTitle")}</p>
        <div className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
          <Checkbox
            id="dashboard-quick-capture"
            aria-label={t("dashboard.showWidget", { name: t("inbox.quickCapture") })}
            checked={layout.quickCapture}
            onCheckedChange={onToggleQuickCapture}
          />
          <label htmlFor="dashboard-quick-capture" className="min-w-0 flex-1 cursor-pointer truncate py-0.5 text-sm">
            {t("inbox.quickCapture")}
          </label>
        </div>
        <Separator className="my-1" />
        <ul aria-label={t("dashboard.customizeTitle")}>
          {layout.order.map((id, index) => (
            <li key={id} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
              <Checkbox
                id={`dashboard-widget-${id}`}
                aria-label={t("dashboard.showWidget", { name: widgetLabel(id) })}
                checked={!layout.hidden.includes(id)}
                onCheckedChange={() => onToggle(id)}
              />
              <label htmlFor={`dashboard-widget-${id}`} className="min-w-0 flex-1 cursor-pointer truncate text-sm">
                {widgetLabel(id)}
              </label>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={t("dashboard.moveUp", { name: widgetLabel(id) })}
                disabled={index === 0}
                onClick={() => onMove(id, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={t("dashboard.moveDown", { name: widgetLabel(id) })}
                disabled={index === layout.order.length - 1}
                onClick={() => onMove(id, 1)}
              >
                <ArrowDown />
              </Button>
            </li>
          ))}
        </ul>
        <Separator className="my-1" />
        <Button size="sm" variant="ghost" className="w-full justify-start" onClick={onReset}>
          <RotateCcw />
          {t("dashboard.resetLayout")}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
