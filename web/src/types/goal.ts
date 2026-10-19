export const GOAL_STATUSES = ["active", "paused", "completed", "abandoned"] as const
export const GOAL_DOMAINS = ["health", "career", "learning", "relationships", "personal"] as const
export const GOAL_PROGRESS_MODES = ["auto", "manual"] as const

export type GoalStatus = (typeof GOAL_STATUSES)[number]
export type GoalDomain = (typeof GOAL_DOMAINS)[number]
export type GoalProgressMode = (typeof GOAL_PROGRESS_MODES)[number]
export type GoalRisk = "at_risk" | "overdue" | null

export type ProgressPart = { done: number; total: number }

/** Each part is null when the goal has none of it. */
export type GoalBreakdown = { milestones: ProgressPart | null; tasks: ProgressPart | null; habits: ProgressPart | null }

export type MilestoneMarker = { id: string; title: string; dueAt: string; completedAt: string | null }

export type Goal = {
  id: string
  title: string
  why: string | null
  domain: GoalDomain
  status: GoalStatus
  startAt: string | null
  targetAt: string | null
  completedAt: string | null
  color: string
  progress: number
  progressMode: GoalProgressMode
  linkedTaskIds: string[]
  linkedThoughtIds: string[]
  linkedHabitIds: string[]
  breakdown: GoalBreakdown
  expectedProgress: number | null
  risk: GoalRisk
  milestoneMarkers: MilestoneMarker[]
  createdAt: string
  updatedAt: string
}

export type Milestone = {
  id: string
  goalId: string
  title: string
  dueAt: string | null
  completedAt: string | null
  order: number
}

export type GoalDetail = { goal: Goal; milestones: Milestone[] }

export type GoalInput = {
  title: string
  why?: string | null
  domain?: GoalDomain
  startAt?: string | null
  targetAt?: string | null
  linkedTaskIds?: string[]
  linkedHabitIds?: string[]
  milestones?: { title: string }[]
}

export type GoalUpdate = Partial<Omit<GoalInput, "milestones">> & {
  status?: GoalStatus
  progress?: number
  progressMode?: GoalProgressMode
}

export type MilestoneInput = { title: string; dueAt?: string | null }

export type MilestoneUpdate = { title?: string; dueAt?: string | null; completedAt?: string | null }

export type GoalProgressPoint = { day: string; progress: number }

export type GoalProgressHistory = { items: GoalProgressPoint[]; startingProgress: number | null }

export type GoalProgressFilters = { from?: string; to?: string }

export type GoalChartPoint = { day: string; label: string; progress: number | null }

export type GoalView = "all" | GoalStatus
export type GoalDomainFilter = "all" | GoalDomain
export type GoalLayout = "grid" | "timeline"

export type GoalFormValues = {
  title: string
  why: string
  domain: GoalDomain
  startAt: string
  targetAt: string
  milestones: string
  linkedTaskIds: string[]
  linkedHabitIds: string[]
}

export type GoalGroup = { domain: GoalDomain; goals: Goal[] }

export type TimelineMonth = { key: string; label: string; left: number; width: number }

/** Positions are percentages of the timeline's width. */
export type TimelineScale = { start: number; end: number; months: TimelineMonth[]; today: number }

export type TimelineBar = { left: number; width: number }

export type GoalCardProps = { goal: Goal; onOpen: (goal: Goal) => void }

export type GoalGridProps = { goals: Goal[]; grouped: boolean; onOpen: (goal: Goal) => void }

export type GoalCardListProps = { goals: Goal[]; onOpen: (goal: Goal) => void }

export type GoalStatsProps = { goals: Goal[] }

export type GoalFormDialogProps = { open: boolean; goal: Goal | null; onOpenChange: (open: boolean) => void }

export type GoalDetailSheetProps = { goalId: string | null; onClose: () => void; onEdit: (goal: Goal) => void }

export type GoalDetailBodyProps = { detail: GoalDetail; onClose: () => void; onEdit: (goal: Goal) => void }

export type GoalMilestonesProps = { goal: Goal; milestones: Milestone[] }

export type GoalMilestoneRowProps = { goal: Goal; milestone: Milestone }

export type GoalLinkedTasksProps = { taskIds: string[] }

export type GoalLinkedHabitsProps = { goal: Goal }

export type GoalHabitPickerProps = { selected: string[]; onChange: (ids: string[]) => void }

export type GoalRiskBadgeProps = { risk: GoalRisk }

export type GoalProgressBreakdownProps = { goal: Goal }

export type GoalProgressSectionProps = { goal: Goal }

export type GoalManualProgressProps = { goal: Goal }

export type GoalProgressChartProps = { goalId: string }

export type GoalProgressLineProps = { points: GoalChartPoint[] }

export type GoalTimelineProps = { goals: Goal[]; onOpen: (goal: Goal) => void }

export type GoalTimelineRowProps = { goal: Goal; scale: TimelineScale; onOpen: (goal: Goal) => void }

export type GoalTimelineAxisProps = { scale: TimelineScale }

export type GoalUndatedListProps = { goals: Goal[]; onOpen: (goal: Goal) => void }

export type GoalsToolbarProps = {
  goals: Goal[]
  view: GoalView
  onViewChange: (view: GoalView) => void
  domain: GoalDomainFilter
  onDomainChange: (domain: GoalDomainFilter) => void
  layout: GoalLayout
  onLayoutChange: (layout: GoalLayout) => void
  grouped: boolean
  onGroupedChange: (grouped: boolean) => void
}

export type GoalDomainFilterProps = { value: GoalDomainFilter; onChange: (value: GoalDomainFilter) => void }

export type GoalDialogState = { open: boolean; goal: Goal | null }
