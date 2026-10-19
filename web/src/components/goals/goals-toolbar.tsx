import { useTranslation } from "react-i18next"
import { Group } from "lucide-react"
import { GoalDomainFilter } from "@/components/goals/goal-domain-filter"
import { SegmentedControl } from "@/components/shared/segmented-control"
import { Button } from "@/components/ui/button"
import { countGoals, getGoalStatusOptions } from "@/lib/goals"
import type { GoalLayout, GoalsToolbarProps, GoalView } from "@/types/goal"

export function GoalsToolbar({ goals, view, onViewChange, domain, onDomainChange, layout, onLayoutChange, grouped, onGroupedChange }: GoalsToolbarProps) {
  const { t } = useTranslation()
  const counts = countGoals(goals)

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<GoalView>
          label={t("goals.views")}
          value={view}
          onChange={onViewChange}
          options={[{ value: "all", label: t("common.all"), count: goals.length }, ...getGoalStatusOptions().map((option) => ({ ...option, count: counts[option.value] }))]}
        />
        <div className="flex flex-wrap items-center gap-2">
          {layout === "grid" ? (
            <Button type="button" size="sm" variant={grouped ? "secondary" : "ghost"} aria-pressed={grouped} onClick={() => onGroupedChange(!grouped)}>
              <Group />
              {t("goals.groupByArea")}
            </Button>
          ) : null}
          <SegmentedControl<GoalLayout>
            label={t("goals.layout")}
            value={layout}
            onChange={onLayoutChange}
            options={[
              { value: "grid", label: t("goals.grid") },
              { value: "timeline", label: t("goals.timeline") },
            ]}
          />
        </div>
      </div>
      <GoalDomainFilter value={domain} onChange={onDomainChange} />
    </div>
  )
}
