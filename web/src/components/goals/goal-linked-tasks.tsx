import { useTranslation } from "react-i18next"
import { CircleCheck, Circle } from "lucide-react"
import { useResolvedLinks } from "@/hooks/queries/use-links"
import type { GoalLinkedTasksProps } from "@/types/goal"

export function GoalLinkedTasks({ taskIds }: GoalLinkedTasksProps) {
  const { t } = useTranslation()
  const links = useResolvedLinks({ taskIds })
  const tasks = (links.data ?? []).flatMap((link) => (link.moduleId === "tasks" ? [link.entity] : []))

  return tasks.length > 0 ? (
    <ul className="flex flex-col gap-1.5">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-center gap-2 text-sm">
          {task.status === "done" ? <CircleCheck className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}
          <span className="truncate">{task.title}</span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">{t("goals.noLinkedTasks")}</p>
  )
}
