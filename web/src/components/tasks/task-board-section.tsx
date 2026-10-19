import { useTranslation } from "react-i18next"
import { useDroppable } from "@dnd-kit/core"
import { rectSortingStrategy, SortableContext } from "@dnd-kit/sortable"
import { MasonryBoard } from "@/components/shared/masonry-board"
import { TaskCard } from "@/components/tasks/task-card"
import { cn } from "@/lib/utils"
import type { TaskBoardSectionProps } from "@/types/task"

/** Pinned or Others: a sortable masonry of cards that also accepts drops on its empty area. */
export function TaskBoardSection({ id, title, tasks, sortable, onEdit }: TaskBoardSectionProps) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !sortable })

  return (
    <section ref={setNodeRef} aria-label={title ?? t("tasks.others")} className={cn("flex min-w-0 flex-col gap-2 rounded-2xl transition-colors", isOver && "bg-muted/40")}>
      {title ? <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2> : null}
      <SortableContext id={id} items={tasks.map((task) => task.id)} strategy={rectSortingStrategy} disabled={!sortable}>
        {tasks.length > 0 ? (
          <MasonryBoard items={tasks} getKey={(task) => task.id} renderItem={(task) => <TaskCard task={task} sortable={sortable} onEdit={onEdit} />} />
        ) : (
          <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{t("tasks.dropHere")}</p>
        )}
      </SortableContext>
    </section>
  )
}
