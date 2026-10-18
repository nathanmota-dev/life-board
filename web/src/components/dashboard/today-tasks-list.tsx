import { useTranslation } from "react-i18next"
import { StatusBadge } from "@/components/shared/status-badge"
import { Checkbox } from "@/components/ui/checkbox"
import { useUpdateTask } from "@/hooks/queries/use-tasks"
import { dueLabel, isOverdue, getTaskPriorityLabels, PRIORITY_TONES } from "@/lib/tasks"
import { cn } from "@/lib/utils"
import type { TodayTasksListProps } from "@/types/dashboard"

export function TodayTasksList({ tasks }: TodayTasksListProps) {
  const { t } = useTranslation()
  const update = useUpdateTask()

  return (
    <ul className="divide-y rounded-xl border">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-center gap-3 px-3 py-2.5">
          <Checkbox
            aria-label={t("common.complete", { title: task.title })}
            checked={false}
            onCheckedChange={() => update.mutate({ id: task.id, input: { status: "done" } })}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{task.title}</p>
            <p className={cn("text-xs text-muted-foreground", isOverdue(task) && "text-destructive")}>
              {task.dueAt ? t("tasks.dueOn", { date: dueLabel(task) }) : t("dashboard.plannedToday")}
            </p>
          </div>
          {task.priority !== "none" ? <StatusBadge label={getTaskPriorityLabels()[task.priority]} tone={PRIORITY_TONES[task.priority]} /> : null}
        </li>
      ))}
    </ul>
  )
}
