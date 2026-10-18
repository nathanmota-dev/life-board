import { Check, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRemoveTask, useUpdateTask } from "@/hooks/queries/use-tasks"
import { formatRelativeDay } from "@/lib/dates"
import { STATUS_OPTIONS } from "@/lib/tasks"
import type { InboxTaskRowProps } from "@/types/inbox"

const TRIAGE = STATUS_OPTIONS.filter((option) => option.value !== "inbox" && option.value !== "done")

export function InboxTaskRow({ task }: InboxTaskRowProps) {
  const update = useUpdateTask()
  const remove = useRemoveTask()

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{task.title}</p>
        <p className="text-xs text-muted-foreground">Captured {formatRelativeDay(task.createdAt)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {TRIAGE.map((option) => (
          <Button
            key={option.value}
            variant="outline"
            size="xs"
            disabled={update.isPending}
            onClick={() => update.mutate({ id: task.id, input: { status: option.value } })}
          >
            {option.label}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Complete ${task.title}`}
          onClick={() => update.mutate({ id: task.id, input: { status: "done" } })}
        >
          <Check />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${task.title}`} onClick={() => remove.mutate(task.id)}>
          <Trash2 />
        </Button>
      </div>
    </li>
  )
}
