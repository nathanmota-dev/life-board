import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronRight } from "lucide-react"
import { MasonryBoard } from "@/components/shared/masonry-board"
import { TaskCard } from "@/components/tasks/task-card"
import { cn } from "@/lib/utils"
import type { TaskCompletedSectionProps } from "@/types/task"

/** Done tasks, collapsed at the end of the board. */
export function TaskCompletedSection({ tasks, onEdit }: TaskCompletedSectionProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <section aria-label={t("tasks.completed")} className="flex min-w-0 flex-col gap-2 border-t pt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex cursor-pointer items-center gap-1.5 self-start rounded-md px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {t("tasks.completed")}
        <span className="tabular-nums">{tasks.length}</span>
      </button>
      {open ? <MasonryBoard items={tasks} getKey={(task) => task.id} renderItem={(task) => <TaskCard task={task} onEdit={onEdit} />} /> : null}
    </section>
  )
}
