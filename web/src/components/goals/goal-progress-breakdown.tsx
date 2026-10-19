import { useTranslation } from "react-i18next"
import { formatBreakdown, hasProgressParts } from "@/lib/goals"
import type { GoalProgressBreakdownProps } from "@/types/goal"

/** What the auto progress is made of, or how to give it something to count. */
export function GoalProgressBreakdown({ goal }: GoalProgressBreakdownProps) {
  const { t } = useTranslation()
  const hasParts = hasProgressParts(goal.breakdown)

  return (
    <p className="text-xs text-muted-foreground">
      {hasParts ? formatBreakdown(goal.breakdown) : t("goals.noProgressParts")}
    </p>
  )
}
