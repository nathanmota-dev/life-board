export const TASK_STATUSES = ["inbox", "today", "upcoming", "someday", "done"] as const
export const TASK_PRIORITIES = ["none", "low", "medium", "high"] as const
export const TASK_COLORS = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "gray"] as const
export const TASK_CHIPS = ["all", "today", "upcoming", "someday", "overdue", "archived", "completed"] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type TaskColor = (typeof TASK_COLORS)[number]

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
  pinned: boolean
  color: TaskColor | null
  order: number
  archivedAt: string | null
  focusDay: string | null
  createdAt: string
  updatedAt: string
}

/** A top-level task as the board loads it, with its checklist items. */
export type BoardTask = Task & { children: Task[] }

export type TaskInput = {
  title: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  dueAt?: string | null
  tags?: string[]
  linkedThoughtIds?: string[]
  pinned?: boolean
  color?: TaskColor | null
  parentTaskId?: string | null
  focusDay?: string | null
  items?: string[]
}

export type TaskUpdate = Partial<TaskInput> & { completedAt?: string | null; archivedAt?: string | null }

export type TaskFilters = {
  status?: TaskStatus
  search?: string
  tag?: string
  limit?: number
  parentTaskId?: string
  include?: "children"
  archived?: boolean
  focusDay?: string
}

/** A task entering a day's focus, or leaving it with `null`. */
export type FocusChange = { id: string; focusDay: string | null }

export type TaskOrderItem = { id: string; order: number; pinned: boolean }

export type TaskLayout = "board" | "list"

export type TaskChip = (typeof TASK_CHIPS)[number]

export type TaskBoardFilters = { chip: TaskChip; tag: string | null; color: TaskColor | null }

export type TaskSections = { pinned: BoardTask[]; others: BoardTask[] }

export type TaskBoardSection = "pinned" | "others"

export type ChecklistView = { open: Task[]; done: Task[]; hiddenDone: number }

export type TaskDraftItem = { id: string; text: string }

export type TaskDraft = { title: string; notes: string; checklist: boolean; items: TaskDraftItem[] }

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

export type TaskChecklistEditorProps = { taskId: string }

export type TaskDialogState = { open: boolean; task: Task | null }

export type TaskBoardProps = {
  sections: TaskSections
  sortable: boolean
  onEdit: (task: Task) => void
}

export type TaskBoardSectionProps = {
  id: TaskBoardSection
  title?: string
  tasks: BoardTask[]
  sortable: boolean
  onEdit: (task: Task) => void
}

export type TaskCardProps = { task: BoardTask; sortable?: boolean; onEdit: (task: Task) => void }

export type TaskCardActionsProps = { task: BoardTask; onEdit: (task: Task) => void }

export type TaskChecklistProps = { items: Task[]; onToggle: (item: Task) => void }

export type TaskColorPickerProps = { value: TaskColor | null; clearLabel: string; onChange: (color: TaskColor | null) => void }

export type TaskDuePickerProps = { value: string | null; onChange: (dueAt: string | null) => void }

export type TaskComposerChecklistProps = {
  items: TaskDraftItem[]
  onChange: (items: TaskDraftItem[]) => void
}

export type TaskFiltersProps = {
  filters: TaskBoardFilters
  tags: string[]
  onChange: (filters: TaskBoardFilters) => void
}

