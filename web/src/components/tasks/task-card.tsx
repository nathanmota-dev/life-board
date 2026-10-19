import { useTranslation } from "react-i18next"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { CalendarDays, CircleCheck, GripVertical, Pin } from "lucide-react"
import { NoteCard } from "@/components/shared/note-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { TagList } from "@/components/shared/tag-list"
import { TaskCardActions } from "@/components/tasks/task-card-actions"
import { TaskChecklist } from "@/components/tasks/task-checklist"
import { Button } from "@/components/ui/button"
import { useUpdateTask } from "@/hooks/queries/use-tasks"
import { canCompleteFromChecklist, dueLabel, getTaskPriorityLabels, isOverdue, PRIORITY_TONES, TASK_COLOR_CLASSES } from "@/lib/tasks"
import { cn } from "@/lib/utils"
import type { TaskCardProps } from "@/types/task"

export function TaskCard({ task, sortable = false, onEdit }: TaskCardProps) {
  const { t } = useTranslation()
  const update = useUpdateTask()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !sortable })
  const done = task.status === "done"
  const hasMeta = task.dueAt !== null || task.priority !== "none" || task.tags.length > 0

  return (
    <NoteCard
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      toneClassName={task.color ? TASK_COLOR_CLASSES[task.color].card : undefined}
      dragging={isDragging}
      label={task.title}
      header={
        <div className="flex items-start gap-1">
          {sortable ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              aria-label={t("tasks.reorder", { title: task.title })}
              className="-ml-1.5 flex h-5 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/note:opacity-100 hover:bg-muted focus-visible:opacity-100 active:cursor-grabbing pointer-coarse:opacity-100"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
          ) : null}
          <button type="button" onClick={() => onEdit(task)} className="min-w-0 flex-1 cursor-pointer text-left text-sm font-medium break-words hover:underline">
            <span className={cn(done && "text-muted-foreground line-through")}>{task.title}</span>
          </button>
          {task.pinned ? <Pin className="mt-0.5 size-3.5 shrink-0 text-primary" aria-label={t("tasks.pinned")} /> : null}
        </div>
      }
      actions={<TaskCardActions task={task} onEdit={onEdit} />}
    >
      {task.description ? <p className="line-clamp-6 text-sm break-words whitespace-pre-line text-muted-foreground">{task.description}</p> : null}
      {task.children.length > 0 ? (
        <TaskChecklist
          items={task.children}
          onToggle={(item) => update.mutate({ id: item.id, input: { status: item.status === "done" ? "inbox" : "done" } })}
        />
      ) : null}
      {canCompleteFromChecklist(task) ? (
        <Button size="xs" variant="outline" className="self-start bg-background text-primary" onClick={() => update.mutate({ id: task.id, input: { status: "done" } })}>
          <CircleCheck />
          {t("tasks.completeTask")}
        </Button>
      ) : null}
      {hasMeta ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {task.dueAt ? (
            <span className={cn("inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-xs text-muted-foreground", isOverdue(task) && "font-medium text-destructive")}>
              <CalendarDays className="size-3" />
              {dueLabel(task)}
            </span>
          ) : null}
          {task.priority !== "none" ? <StatusBadge label={getTaskPriorityLabels()[task.priority]} tone={PRIORITY_TONES[task.priority]} /> : null}
          {task.tags.length > 0 ? <TagList tags={task.tags} /> : null}
        </div>
      ) : null}
    </NoteCard>
  )
}
