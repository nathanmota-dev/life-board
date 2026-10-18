export const PROJECT_STATUSES = ["idea", "planned", "in_progress", "paused", "done"] as const

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export type Project = {
  id: string
  title: string
  description: string
  status: ProjectStatus
  order: number
  createdAt: string
  updatedAt: string
}

export type ProjectInput = {
  title?: string
  description?: string
  status?: ProjectStatus
}

export type ProjectFormValues = { title: string; description: string; status: ProjectStatus }

export type ProjectDialogState = { open: boolean; project: Project | null }

export type ProjectCardProps = { project: Project; position: number; onEdit: (project: Project) => void }

export type ProjectGridProps = { projects: Project[]; onEdit: (project: Project) => void }

export type ProjectFormDialogProps = { open: boolean; project: Project | null; onOpenChange: (open: boolean) => void }
