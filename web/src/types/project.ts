import type { ReactNode } from "react"

export const PROJECT_STATUSES = ["idea", "planned", "in_progress", "paused", "done"] as const

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export type Project = {
  id: string
  title: string
  description: string
  status: ProjectStatus
  /** Position inside the status column. */
  order: number
  statusChangedAt: string
  pauseReason: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ProjectStatusChange = {
  id: string
  projectId: string
  status: ProjectStatus
  pauseReason: string | null
  changedAt: string
}

export type ProjectInput = {
  title?: string
  description?: string
  status?: ProjectStatus
  pauseReason?: string | null
}

/** `order` is the project's index in the target column once it lands there. */
export type ProjectMoveInput = { status: ProjectStatus; order: number; pauseReason?: string | null }

export type ProjectMove = { id: string; input: ProjectMoveInput }

export type ProjectView = "board" | "archived"

export type ProjectFormValues = { title: string; description: string; status: ProjectStatus; pauseReason: string }

export type ProjectDialogState = { open: boolean; project: Project | null }

export type ProjectActions = {
  open: (project: Project) => void
  edit: (project: Project) => void
  move: (move: ProjectMove) => void
  archive: (project: Project) => void
  remove: (project: Project) => void
}

/** What the page provides to the board actions: opening the sheet or dialog, and asking for a pause reason. */
export type ProjectActionHandlers = {
  open: (project: Project) => void
  edit: (project: Project) => void
  askPauseReason: (move: ProjectMove) => void
}

export type ProjectCardProps = { project: Project; actions: ProjectActions }

export type ProjectBoardProps = { projects: Project[]; actions: ProjectActions }

export type ProjectColumnProps = {
  status: ProjectStatus
  count: number
  /** Shown on the column, which is highlighted while it's set. */
  warning?: string
  action?: ReactNode
  top?: ReactNode
  bottom?: ReactNode
  children: ReactNode
}

export type ProjectWipLimitProps = { limit: number | null; onChange: (limit: number | null) => void }

export type ProjectArchivedRowProps = { project: Project }

export type ProjectPauseDialogProps = { move: ProjectMove | null; onConfirm: (move: ProjectMove) => void; onCancel: () => void }

export type ProjectDetailSheetProps = { project: Project | null; actions: ProjectActions; onClose: () => void }

export type ProjectDetailBodyProps = { project: Project; actions: ProjectActions; onClose: () => void }

export type ProjectHistoryProps = { projectId: string }

export type ProjectFormDialogProps = { open: boolean; project: Project | null; onOpenChange: (open: boolean) => void }
