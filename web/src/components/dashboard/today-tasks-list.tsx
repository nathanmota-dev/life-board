import { StatusBadge } from "@/components/shared/status-badge"
import { Checkbox } from "@/components/ui/checkbox"
import { useUpdateTask } from "@/hooks/queries/use-tasks"
import { dueLabel, isOverdue, PRIORITY_LABELS, PRIORITY_TONES } from "@/lib/tasks"
import { cn } from "@/lib/utils"
import type { TodayTasksListProps } from "@/types/dashboard"

export function TodayTasksList({ tasks }: TodayTasksListProps) {
  const update = useUpdateTask()

  return (
    <ul className="divide-y rounded-xl border">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-center gap-3 px-3 py-2.5">
          <Checkbox
            aria-label={`Complete ${task.title}`}
            checked={false}
            onCheckedChange={() => update.mutate({ id: task.id, input: { status: "done" } })}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{task.title}</p>
            <p className={cn("text-xs text-muted-foreground", isOverdue(task) && "text-destructive")}>
              {task.dueAt ? `Due ${dueLabel(task)}` : "Planned for today"}
            </p>
          </div>
          {task.priority !== "none" ? <StatusBadge label={PRIORITY_LABELS[task.priority]} tone={PRIORITY_TONES[task.priority]} /> : null}
        </li>
      ))}
    </ul>
  )
}
