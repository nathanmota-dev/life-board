import { useTranslation } from "react-i18next"
import { StatusBadge } from "@/components/shared/status-badge"
import { GOAL_RISK_TONES } from "@/lib/goals"
import type { GoalRiskBadgeProps } from "@/types/goal"

export function GoalRiskBadge({ risk }: GoalRiskBadgeProps) {
  const { t } = useTranslation()
  return risk ? <StatusBadge label={t(`goalRisks.${risk}`)} tone={GOAL_RISK_TONES[risk]} /> : null
}
