import { useTranslation } from "react-i18next"
import { Archive, ArchiveRestore, CalendarClock, CircleCheck, Palette, Pencil, Pin, PinOff, RotateCcw, Trash2 } from "lucide-react"
import { RowActions } from "@/components/shared/row-actions"
import { TaskColorPicker } from "@/components/tasks/task-color-picker"
import { TaskDuePicker } from "@/components/tasks/task-due-picker"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useTaskActions } from "@/hooks/queries/use-task-actions"
import { useUpdateTask } from "@/hooks/queries/use-tasks"
import type { TaskCardActionsProps, TaskUpdate } from "@/types/task"

/** Done, pin, color, due date, archive and more; shown along the bottom of a card. */
export function TaskCardActions({ task, onEdit }: TaskCardActionsProps) {
  const { t } = useTranslation()
  const update = useUpdateTask()
  const actions = useTaskActions()
  const patch = (input: TaskUpdate) => update.mutate({ id: task.id, input })
  const pinLabel = task.pinned ? t("tasks.unpin") : t("tasks.pin")
  const archiveLabel = task.archivedAt ? t("tasks.unarchive") : t("tasks.archive")
  const done = task.status === "done"

  return (
    <>
      {done ? null : (
        <Button variant="ghost" size="icon-sm" aria-label={t("tasks.markDone")} title={t("tasks.markDone")} onClick={() => patch({ status: "done" })}>
          <CircleCheck />
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" aria-label={pinLabel} title={pinLabel} onClick={() => patch({ pinned: !task.pinned })}>
        {task.pinned ? <PinOff /> : <Pin />}
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("tasks.color")} title={t("tasks.color")}>
            <Palette />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <TaskColorPicker value={task.color} clearLabel={t("tasks.noColor")} onChange={(color) => patch({ color })} />
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("tasks.dueDate")} title={t("tasks.dueDate")}>
            <CalendarClock />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-2">
          <TaskDuePicker value={task.dueAt} onChange={(dueAt) => patch({ dueAt })} />
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={archiveLabel}
        title={archiveLabel}
        onClick={() => void (task.archivedAt ? actions.unarchive(task) : actions.archive(task))}
      >
        {task.archivedAt ? <ArchiveRestore /> : <Archive />}
      </Button>
      <div className="ml-auto">
        <RowActions
          label={t("common.itemActions", { title: task.title })}
          actions={[
            { label: t("common.edit"), icon: Pencil, onSelect: () => onEdit(task) },
            ...(done ? [{ label: t("tasks.reopenTask"), icon: RotateCcw, onSelect: () => patch({ status: "inbox" }) }] : []),
            { label: t("common.delete"), icon: Trash2, destructive: true, onSelect: () => void actions.remove(task) },
          ]}
        />
      </div>
    </>
  )
}
