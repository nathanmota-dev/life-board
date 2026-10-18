import { useTranslation } from "react-i18next"
import { Check, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRemoveTask, useUpdateTask } from "@/hooks/queries/use-tasks"
import { formatRelativeDay } from "@/lib/dates"
import { getTaskStatusOptions } from "@/lib/tasks"
import type { InboxTaskRowProps } from "@/types/inbox"

export function InboxTaskRow({ task }: InboxTaskRowProps) {
  const { t } = useTranslation()
  const triage = getTaskStatusOptions().filter((option) => option.value !== "inbox" && option.value !== "done")
  const update = useUpdateTask()
  const remove = useRemoveTask()

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{task.title}</p>
        <p className="text-xs text-muted-foreground">{t("inbox.capturedOn", { date: formatRelativeDay(task.createdAt) })}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {triage.map((option) => (
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
          aria-label={t("common.complete", { title: task.title })}
          onClick={() => update.mutate({ id: task.id, input: { status: "done" } })}
        >
          <Check />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={t("common.deleteItem", { title: task.title })} onClick={() => remove.mutate(task.id)}>
          <Trash2 />
        </Button>
      </div>
    </li>
  )
}
