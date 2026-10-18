import { useTranslation } from "react-i18next"
import { Lightbulb, ListTodo } from "lucide-react"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { StatusBadge } from "@/components/shared/status-badge"
import { Panel } from "@/components/workspace-ui"
import { useTasks } from "@/hooks/queries/use-tasks"
import { useThoughts } from "@/hooks/queries/use-thoughts"
import { formatRelativeDay } from "@/lib/dates"
import { getTaskStatusLabels, STATUS_TONES } from "@/lib/tasks"
import { thoughtTitle } from "@/lib/thoughts"
import type { TagDetailProps } from "@/types/tag"

export function TagDetail({ tag }: TagDetailProps) {
  const { t } = useTranslation()
  const tasks = useTasks({ tag, limit: 100 })
  const thoughts = useThoughts({ tag, limit: 50 })
  const taskItems = tasks.data ?? []
  const thoughtItems = thoughts.data ?? []

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title={t("navigation.tasks")} icon={ListTodo}>
        <DataState isLoading={tasks.isLoading} error={tasks.error} isEmpty={taskItems.length === 0} empty={<EmptyState icon={ListTodo} title={t("tags.noTasks", { tag })} />}>
          <ul className="divide-y rounded-xl border">
            {taskItems.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="truncate text-sm">{task.title}</span>
                <StatusBadge label={getTaskStatusLabels()[task.status]} tone={STATUS_TONES[task.status]} />
              </li>
            ))}
          </ul>
        </DataState>
      </Panel>
      <Panel title={t("navigation.thoughts")} icon={Lightbulb}>
        <DataState
          isLoading={thoughts.isLoading}
          error={thoughts.error}
          isEmpty={thoughtItems.length === 0}
          empty={<EmptyState icon={Lightbulb} title={t("tags.noThoughts", { tag })} />}
        >
          <ul className="divide-y rounded-xl border">
            {thoughtItems.map((thought) => (
              <li key={thought.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="truncate text-sm">{thoughtTitle(thought)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeDay(thought.createdAt)}</span>
              </li>
            ))}
          </ul>
        </DataState>
      </Panel>
    </div>
  )
}
