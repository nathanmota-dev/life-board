export const GOAL_STATUSES = ["active", "paused", "completed", "abandoned"] as const
export const GOAL_DOMAINS = ["health", "career", "learning", "relationships", "personal"] as const

export type GoalStatus = (typeof GOAL_STATUSES)[number]
export type GoalDomain = (typeof GOAL_DOMAINS)[number]

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
  linkedTaskIds: string[]
  linkedThoughtIds: string[]
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
  targetAt?: string | null
  linkedTaskIds?: string[]
  milestones?: { title: string }[]
}

export type GoalUpdate = Partial<Omit<GoalInput, "milestones">> & {
  status?: GoalStatus
  progress?: number
}

export type MilestoneUpdate = { title?: string; completedAt?: string | null }

export type GoalView = "all" | GoalStatus

export type GoalFormValues = {
  title: string
  why: string
  domain: GoalDomain
  targetAt: string
  milestones: string
  linkedTaskIds: string[]
}

export type GoalCardProps = { goal: Goal; onOpen: (goal: Goal) => void }

export type GoalGridProps = { goals: Goal[]; onOpen: (goal: Goal) => void }

export type GoalStatsProps = { goals: Goal[] }

export type GoalFormDialogProps = { open: boolean; goal: Goal | null; onOpenChange: (open: boolean) => void }

export type GoalDetailSheetProps = { goalId: string | null; onClose: () => void; onEdit: (goal: Goal) => void }

export type GoalDetailBodyProps = { detail: GoalDetail; onClose: () => void; onEdit: (goal: Goal) => void }

export type GoalMilestonesProps = { goal: Goal; milestones: Milestone[] }

export type GoalLinkedTasksProps = { taskIds: string[] }

export type GoalDialogState = { open: boolean; goal: Goal | null }
