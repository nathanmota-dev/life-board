import { useTranslation } from "react-i18next"
import type { KeyboardEventHandler, PointerEventHandler } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Archive, Clock, GripVertical, Pause, Pencil, Trash2 } from "lucide-react"
import { RowActions } from "@/components/shared/row-actions"
import { daysSinceStatusChange } from "@/lib/projects"
import { cn } from "@/lib/utils"
import type { ProjectCardProps } from "@/types/project"
import type { RowAction } from "@/types/ui"

/**
 * The whole card drags with the pointer and opens the detail sheet on click (dnd-kit
 * swallows the click that ends a drag). The grip is the keyboard handle, and the title
 * button is the keyboard way to open the sheet: its click bubbles up to the card.
 */
export function ProjectCard({ project, actions }: ProjectCardProps) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: project.id })
  // dnd-kit types its listeners as plain functions; these are the sensors' React handlers.
  const { onPointerDown, onKeyDown } = (listeners ?? {}) as { onPointerDown?: PointerEventHandler; onKeyDown?: KeyboardEventHandler }
  const menu: RowAction[] = [
    { label: t("common.edit"), icon: Pencil, onSelect: () => actions.edit(project) },
    ...(project.status === "done" ? [{ label: t("projects.archive"), icon: Archive, onSelect: () => actions.archive(project) }] : []),
    { label: t("common.delete"), icon: Trash2, destructive: true, onSelect: () => actions.remove(project) },
  ]

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onPointerDown={onPointerDown}
      onClick={() => actions.open(project)}
      className={cn(
        "flex min-w-0 cursor-grab touch-none flex-col gap-1.5 rounded-xl border bg-card p-2.5 shadow-xs select-none hover:border-primary/40 active:cursor-grabbing",
        isDragging && "relative z-10 cursor-grabbing opacity-80 shadow-lg ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={t("projects.move", { title: project.title })}
          className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
          {...attributes}
          onKeyDown={onKeyDown}
          onClick={(event) => event.stopPropagation()}
        >
          <GripVertical className="size-4" />
        </button>
        <button type="button" className="min-w-0 flex-1 cursor-grab py-0.5 text-left active:cursor-grabbing">
          <h3 className="line-clamp-2 text-sm font-medium break-words">{project.title}</h3>
        </button>
        {/* The menu (and its portal) must neither start a drag nor open the sheet. */}
        <div onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
          <RowActions label={t("common.itemActions", { title: project.title })} actions={menu} />
        </div>
      </div>
      {project.description ? (
        <p className="line-clamp-2 px-1 text-xs whitespace-pre-line text-muted-foreground">{project.description}</p>
      ) : null}
      {project.status === "paused" && project.pauseReason ? (
        <p className="flex items-start gap-1.5 rounded-md bg-warning/10 px-2 py-1 text-xs text-warning">
          <Pause className="mt-0.5 size-3 shrink-0" />
          <span className="min-w-0 break-words">{project.pauseReason}</span>
        </p>
      ) : null}
      <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <Clock className="size-3 shrink-0" />
        {t("projects.daysInStatus", { count: daysSinceStatusChange(project) })}
      </p>
    </article>
  )
}
