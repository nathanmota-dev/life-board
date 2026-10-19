import { formatDate, fromDateInput, fromDayKey, toDateInput } from "@/lib/dates"
import { i18n } from "@/lib/i18n"
import {
  GOAL_DOMAINS,
  GOAL_STATUSES,
  type Goal,
  type GoalBreakdown,
  type GoalChartPoint,
  type GoalDomain,
  type GoalFormValues,
  type GoalGroup,
  type GoalInput,
  type GoalLayout,
  type GoalProgressHistory,
  type GoalRisk,
  type GoalStatus,
  type TimelineBar,
  type TimelineScale,
} from "@/types/goal"
import type { SelectOption, StatusTone } from "@/types/ui"

export const GOAL_STATUS_TONES: Record<GoalStatus, StatusTone> = {
  active: "brand",
  paused: "warning",
  completed: "success",
  abandoned: "neutral",
}

export const GOAL_RISK_TONES: Record<Exclude<GoalRisk, null>, StatusTone> = {
  at_risk: "warning",
  overdue: "danger",
}

/** Accent tokens, so domain colors follow the Settings accent. */
export const GOAL_DOMAIN_COLORS: Record<GoalDomain, string> = {
  health: "var(--chart-1)",
  career: "var(--chart-2)",
  learning: "var(--chart-3)",
  relationships: "var(--chart-4)",
  personal: "var(--chart-5)",
}

export function getGoalStatusOptions(): SelectOption<GoalStatus>[] {
  return GOAL_STATUSES.map((value) => ({ value, label: i18n.t(`goalStatuses.${value}`) }))
}

export function getGoalDomainOptions() {
  return GOAL_DOMAINS.map((value) => ({ value, label: i18n.t(`goalDomains.${value}`) }))
}

export function emptyGoalValues(): GoalFormValues {
  return { title: "", why: "", domain: "personal", startAt: "", targetAt: "", milestones: "", linkedTaskIds: [], linkedHabitIds: [] }
}

export function goalToValues(goal: Goal): GoalFormValues {
  return {
    title: goal.title,
    why: goal.why ?? "",
    domain: goal.domain,
    startAt: toDateInput(goal.startAt),
    targetAt: toDateInput(goal.targetAt),
    milestones: "",
    linkedTaskIds: goal.linkedTaskIds,
    linkedHabitIds: goal.linkedHabitIds,
  }
}

export function valuesToGoalInput(values: GoalFormValues): GoalInput {
  return {
    title: values.title.trim(),
    why: values.why.trim() || null,
    domain: values.domain,
    startAt: fromDateInput(values.startAt),
    targetAt: fromDateInput(values.targetAt),
    milestones: values.milestones
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((title) => ({ title })),
    linkedTaskIds: values.linkedTaskIds,
    linkedHabitIds: values.linkedHabitIds,
  }
}

export function countGoals(goals: Goal[]) {
  return goals.reduce<Record<GoalStatus, number>>(
    (counts, goal) => ({ ...counts, [goal.status]: counts[goal.status] + 1 }),
    { active: 0, paused: 0, completed: 0, abandoned: 0 },
  )
}

/** Goals that are at risk or overdue. */
export function countAtRisk(goals: Goal[]) {
  return goals.filter((goal) => goal.risk !== null).length
}

/** Domains in their usual order, skipping empty ones. */
export function groupByDomain(goals: Goal[]): GoalGroup[] {
  return GOAL_DOMAINS.map((domain) => ({ domain, goals: goals.filter((goal) => goal.domain === domain) })).filter(
    (group) => group.goals.length > 0,
  )
}

export function hasProgressParts(breakdown: GoalBreakdown) {
  return breakdown.milestones !== null || breakdown.tasks !== null || breakdown.habits !== null
}

/** "Milestones 2/4 · Tasks 5/8 · Habits 72%" */
export function formatBreakdown(breakdown: GoalBreakdown) {
  const parts: string[] = []
  if (breakdown.milestones) parts.push(i18n.t("goals.breakdownMilestones", breakdown.milestones))
  if (breakdown.tasks) parts.push(i18n.t("goals.breakdownTasks", breakdown.tasks))
  if (breakdown.habits) {
    const { done, total } = breakdown.habits
    parts.push(i18n.t("goals.breakdownHabits", { percent: total ? Math.round((done / total) * 100) : 0 }))
  }
  return parts.join(" · ")
}

export function goalStart(goal: Goal) {
  return new Date(goal.startAt ?? goal.createdAt)
}

/** A goal can sit on the timeline once it has a target date. */
export function isScheduled(goal: Goal) {
  return goal.targetAt !== null
}

/** A month-aligned scale covering the goals' bars, their milestones and today. */
export function timelineScale(goals: Goal[], today: Date = new Date()): TimelineScale {
  const times = [today.getTime()]
  for (const goal of goals) {
    times.push(goalStart(goal).getTime())
    if (goal.targetAt) times.push(new Date(goal.targetAt).getTime())
    for (const marker of goal.milestoneMarkers) times.push(new Date(marker.dueAt).getTime())
  }
  const first = new Date(Math.min(...times))
  const last = new Date(Math.max(...times))
  const start = new Date(first.getFullYear(), first.getMonth(), 1).getTime()
  const end = new Date(last.getFullYear(), last.getMonth() + 1, 1).getTime()
  const span = end - start
  const months = []
  for (let cursor = new Date(start); cursor.getTime() < end; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime()
    months.push({
      key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
      label: formatDate(cursor, cursor.getMonth() === 0 || months.length === 0 ? { month: "short", year: "numeric" } : { month: "short" }),
      left: ((cursor.getTime() - start) / span) * 100,
      width: ((next - cursor.getTime()) / span) * 100,
    })
  }
  return { start, end, months, today: ((today.getTime() - start) / span) * 100 }
}

/** Percentage offset of `date` on the scale, clamped to its edges. */
export function timelinePosition(scale: TimelineScale, date: string | Date) {
  const offset = ((new Date(date).getTime() - scale.start) / (scale.end - scale.start)) * 100
  return Math.min(100, Math.max(0, offset))
}

export function timelineBar(scale: TimelineScale, goal: Goal): TimelineBar {
  const left = timelinePosition(scale, goalStart(goal))
  const right = goal.targetAt ? timelinePosition(scale, goal.targetAt) : left
  return { left: Math.min(left, right), width: Math.max(Math.abs(right - left), 0.5) }
}

/** One point per day, carrying the last known value over days without a snapshot. */
export function progressSeries(history: GoalProgressHistory, days: string[]): GoalChartPoint[] {
  let current = history.startingProgress
  return days.map((day) => {
    const snapshot = history.items.find((item) => item.day === day)
    if (snapshot) current = snapshot.progress
    return { day, label: formatDate(fromDayKey(day)), progress: current }
  })
}

export const GOAL_LAYOUT_STORAGE_KEY = "life-board-goals-layout"

export function readGoalLayout(): GoalLayout {
  try {
    return window.localStorage.getItem(GOAL_LAYOUT_STORAGE_KEY) === "timeline" ? "timeline" : "grid"
  } catch {
    return "grid"
  }
}

export function saveGoalLayout(layout: GoalLayout) {
  try {
    window.localStorage.setItem(GOAL_LAYOUT_STORAGE_KEY, layout)
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for the session only.
  }
}
