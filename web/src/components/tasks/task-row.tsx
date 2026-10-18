import { useTranslation } from "react-i18next"
import { ArrowRight, Pencil, Trash2 } from "lucide-react"
import { RowActions } from "@/components/shared/row-actions"
import { StatusBadge } from "@/components/shared/status-badge"
import { TagList } from "@/components/shared/tag-list"
import { Checkbox } from "@/components/ui/checkbox"
import { TableCell, TableRow } from "@/components/ui/table"
import { useRemoveTask, useUpdateTask } from "@/hooks/queries/use-tasks"
import { dueLabel, isOverdue, getTaskPriorityLabels, PRIORITY_TONES, getTaskStatusLabels, getTaskStatusOptions, STATUS_TONES } from "@/lib/tasks"
import { cn } from "@/lib/utils"
import type { TaskRowProps } from "@/types/task"

export function TaskRow({ task, onEdit }: TaskRowProps) {
  const { t } = useTranslation()
  const update = useUpdateTask()
  const remove = useRemoveTask()
  const done = task.status === "done"
  const moveActions = getTaskStatusOptions().filter((option) => option.value !== task.status).map((option) => ({
    label: t("tasks.moveTo", { status: option.label }),
    icon: ArrowRight,
    onSelect: () => update.mutate({ id: task.id, input: { status: option.value } }),
  }))

  return (
    <TableRow className="group">
      <TableCell className="w-10 pl-4">
        <Checkbox
          checked={done}
          aria-label={done ? t("common.reopen", { title: task.title }) : t("common.complete", { title: task.title })}
          onCheckedChange={(checked) => update.mutate({ id: task.id, input: { status: checked ? "done" : "today" } })}
        />
      </TableCell>
      <TableCell className="max-w-0 min-w-48">
        <button type="button" onClick={() => onEdit(task)} className="block w-full cursor-pointer truncate text-left text-sm font-medium hover:underline">
          <span className={cn(done && "text-muted-foreground line-through")}>{task.title}</span>
        </button>
        {task.tags.length > 0 ? <TagList tags={task.tags} className="mt-1" /> : null}
      </TableCell>
      <TableCell>
        <StatusBadge label={getTaskPriorityLabels()[task.priority]} tone={PRIORITY_TONES[task.priority]} />
      </TableCell>
      <TableCell className={cn("text-sm whitespace-nowrap text-muted-foreground", isOverdue(task) && "font-medium text-destructive")}>
        {dueLabel(task)}
      </TableCell>
      <TableCell>
        <StatusBadge label={getTaskStatusLabels()[task.status]} tone={STATUS_TONES[task.status]} />
      </TableCell>
      <TableCell className="w-10 pr-3 text-right">
        <RowActions
          label={t("common.itemActions", { title: task.title })}
          actions={[
            { label: t("common.edit"), icon: Pencil, onSelect: () => onEdit(task) },
            ...moveActions,
            { label: t("common.delete"), icon: Trash2, destructive: true, onSelect: () => remove.mutate(task.id) },
          ]}
        />
      </TableCell>
    </TableRow>
  )
}
