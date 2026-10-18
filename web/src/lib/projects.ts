import { arrayMove } from "@dnd-kit/sortable"
import { humanize } from "@/lib/format"
import { PROJECT_STATUSES, type Project, type ProjectFormValues, type ProjectInput, type ProjectStatus } from "@/types/project"
import type { SelectOption, StatusTone } from "@/types/ui"

export const PROJECT_STATUS_TONES: Record<ProjectStatus, StatusTone> = {
  idea: "info",
  planned: "neutral",
  in_progress: "brand",
  paused: "warning",
  done: "success",
}

export const PROJECT_STATUS_OPTIONS: SelectOption<ProjectStatus>[] = PROJECT_STATUSES.map((value) => ({ value, label: humanize(value) }))

export function emptyProjectValues(): ProjectFormValues {
  return { title: "", description: "", status: "idea" }
}

export function projectToValues(project: Project): ProjectFormValues {
  return { title: project.title, description: project.description, status: project.status }
}

export function valuesToProjectInput(values: ProjectFormValues): ProjectInput {
  return { title: values.title.trim(), description: values.description.trim(), status: values.status }
}

/** The list after dragging `activeId` onto `overId`, or null when nothing moved. */
export function moveProject(projects: Project[], activeId: string, overId: string | null) {
  const from = projects.findIndex((project) => project.id === activeId)
  const to = projects.findIndex((project) => project.id === overId)
  if (from === -1 || to === -1 || from === to) return null
  return arrayMove(projects, from, to)
}
