import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Pencil, Trash2 } from "lucide-react"
import { RowActions } from "@/components/shared/row-actions"
import { StatusBadge } from "@/components/shared/status-badge"
import { useRemoveProject } from "@/hooks/queries/use-projects"
import { humanize } from "@/lib/format"
import { PROJECT_STATUS_TONES } from "@/lib/projects"
import { cn } from "@/lib/utils"
import type { ProjectCardProps } from "@/types/project"

export function ProjectCard({ project, position, onEdit }: ProjectCardProps) {
  const remove = useRemoveProject()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: project.id })

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("flex min-w-0 flex-col rounded-2xl border bg-muted/30 p-1 shadow-xs", isDragging && "relative z-10 opacity-80 shadow-lg")}
    >
      <div className="flex min-h-28 flex-col gap-1.5 px-3 pt-2.5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              ref={setActivatorNodeRef}
              aria-label={`Reorder ${project.title}`}
              className="-ml-1 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
            <button type="button" onClick={() => onEdit(project)} className="min-w-0 cursor-pointer text-left">
              <h3 className="truncate text-sm font-medium hover:underline">{project.title}</h3>
            </button>
          </div>
          <RowActions
            label={`${project.title} actions`}
            actions={[
              { label: "Edit", icon: Pencil, onSelect: () => onEdit(project) },
              { label: "Delete", icon: Trash2, destructive: true, onSelect: () => remove.mutate(project.id) },
            ]}
          />
        </div>
        <p className="line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">{project.description || "No description yet."}</p>
      </div>
      <dl className="flex flex-col gap-2.5 rounded-xl border bg-card px-3 py-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <StatusBadge label={humanize(project.status)} tone={PROJECT_STATUS_TONES[project.status]} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Order</dt>
          <dd className="rounded-md border px-2 py-0.5 text-xs tabular-nums">#{position}</dd>
        </div>
      </dl>
    </article>
  )
}
