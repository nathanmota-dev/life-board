import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useCreateTask, useRemoveTask, useTasks, useUpdateTask } from "@/hooks/queries/use-tasks"
import { cn } from "@/lib/utils"
import type { TaskChecklistEditorProps } from "@/types/task"

/** The checklist inside the edit dialog: items are saved as soon as they are added, ticked or removed. */
export function TaskChecklistEditor({ taskId }: TaskChecklistEditorProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState("")
  const items = useTasks({ parentTaskId: taskId, limit: 100 })
  const create = useCreateTask()
  const update = useUpdateTask()
  const remove = useRemoveTask()

  const add = () => {
    if (!title.trim()) return
    create.mutate({ title: title.trim(), parentTaskId: taskId }, { onSuccess: () => setTitle("") })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{t("tasks.checklist")}</p>
      <ul aria-label={t("tasks.checklist")} className="flex flex-col gap-1">
        {(items.data ?? []).map((item) => {
          const done = item.status === "done"
          return (
            <li key={item.id} className="group flex items-center gap-2 text-sm">
              <Checkbox
                checked={done}
                aria-label={done ? t("common.reopen", { title: item.title }) : t("common.complete", { title: item.title })}
                onCheckedChange={() => update.mutate({ id: item.id, input: { status: done ? "inbox" : "done" } })}
              />
              <span className={cn("min-w-0 flex-1 truncate", done && "text-muted-foreground line-through")}>{item.title}</span>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={t("common.removeItem", { title: item.title })} onClick={() => remove.mutate(item.id)}>
                <X />
              </Button>
            </li>
          )
        })}
      </ul>
      <div className="flex items-center gap-2">
        <Input
          value={title}
          aria-label={t("tasks.addItem")}
          placeholder={t("tasks.listItem")}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            event.preventDefault()
            add()
          }}
          className="h-8"
        />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!title.trim() || create.isPending}>
          <Plus />
          {t("tasks.addItem")}
        </Button>
      </div>
    </div>
  )
}
