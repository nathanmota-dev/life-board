export const TASK_STATUSES = ["inbox", "today", "upcoming", "someday", "done"] as const
export const TASK_PRIORITIES = ["none", "low", "medium", "high"] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export type Task = {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  dueAt: string | null
  completedAt: string | null
  parentTaskId: string | null
  tags: string[]
  linkedThoughtIds: string[]
  createdAt: string
  updatedAt: string
}

export type TaskInput = {
  title: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  dueAt?: string | null
  tags?: string[]
  linkedThoughtIds?: string[]
}

export type TaskUpdate = Partial<TaskInput> & { completedAt?: string | null }

export type TaskFilters = {
  status?: TaskStatus
  search?: string
  tag?: string
  limit?: number
}

export type TaskView = "all" | TaskStatus

export type TaskFormValues = {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueAt: string
  tags: string
  linkedThoughtIds: string[]
}

export type TaskTableProps = { tasks: Task[]; onEdit: (task: Task) => void }

export type TaskRowProps = { task: Task; onEdit: (task: Task) => void }

export type TaskFormDialogProps = {
  open: boolean
  task: Task | null
  defaultStatus?: TaskStatus
  onOpenChange: (open: boolean) => void
}

export type TaskFormFieldsProps = {
  values: TaskFormValues
  onChange: (values: TaskFormValues) => void
}

export type TaskBacklinksProps = { taskId: string }

export type TaskDialogState = { open: boolean; task: Task | null }
