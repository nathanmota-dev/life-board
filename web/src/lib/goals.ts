import { fromDateInput, toDateInput } from "@/lib/dates"
import { i18n } from "@/lib/i18n"
import { GOAL_DOMAINS, GOAL_STATUSES, type Goal, type GoalFormValues, type GoalInput, type GoalStatus, type Milestone } from "@/types/goal"
import type { SelectOption, StatusTone } from "@/types/ui"

export const GOAL_STATUS_TONES: Record<GoalStatus, StatusTone> = {
  active: "brand",
  paused: "warning",
  completed: "success",
  abandoned: "neutral",
}

export function getGoalStatusOptions(): SelectOption<GoalStatus>[] {
  return GOAL_STATUSES.map((value) => ({ value, label: i18n.t(`goalStatuses.${value}`) }))
}

export function getGoalDomainOptions() {
  return GOAL_DOMAINS.map((value) => ({ value, label: i18n.t(`goalDomains.${value}`) }))
}

export function milestoneProgress(milestones: Milestone[]) {
  if (milestones.length === 0) return 0
  return Math.round((milestones.filter((milestone) => milestone.completedAt).length / milestones.length) * 100)
}

export function emptyGoalValues(): GoalFormValues {
  return { title: "", why: "", domain: "personal", targetAt: "", milestones: "", linkedTaskIds: [] }
}

export function goalToValues(goal: Goal): GoalFormValues {
  return {
    title: goal.title,
    why: goal.why ?? "",
    domain: goal.domain,
    targetAt: toDateInput(goal.targetAt),
    milestones: "",
    linkedTaskIds: goal.linkedTaskIds,
  }
}

export function valuesToGoalInput(values: GoalFormValues): GoalInput {
  return {
    title: values.title.trim(),
    why: values.why.trim() || null,
    domain: values.domain,
    targetAt: fromDateInput(values.targetAt),
    milestones: values.milestones
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((title) => ({ title })),
    linkedTaskIds: values.linkedTaskIds,
  }
}

export function countGoals(goals: Goal[]) {
  return goals.reduce<Record<GoalStatus, number>>(
    (counts, goal) => ({ ...counts, [goal.status]: counts[goal.status] + 1 }),
    { active: 0, paused: 0, completed: 0, abandoned: 0 },
  )
}
