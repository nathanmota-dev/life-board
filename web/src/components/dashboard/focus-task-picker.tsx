import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Plus } from "lucide-react"
import { DataState } from "@/components/shared/data-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useTasks, useUpdateTask } from "@/hooks/queries/use-tasks"
import { FOCUS_LIMIT, focusCandidates } from "@/lib/dashboard"
import { errorMessage } from "@/lib/format"
import { dueLabel, getTaskStatusLabels, isOverdue } from "@/lib/tasks"
import { cn } from "@/lib/utils"
import type { FocusTaskPickerProps } from "@/types/dashboard"

/** Searchable list of today's, overdue and upcoming tasks; picking one adds it to today's focus. */
export function FocusTaskPicker({ today, focus }: FocusTaskPickerProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")
  const tasks = useTasks({ limit: 200 })
  const update = useUpdateTask()
  const full = focus.length >= FOCUS_LIMIT
  const candidates = focusCandidates(tasks.data ?? [], focus.map((task) => task.id), search)

  return (
    <Popover onOpenChange={() => update.reset()}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus />
          {t("dashboard.chooseFocus")}
          <span className="text-xs text-muted-foreground tabular-nums">{t("dashboard.focusCount", { count: focus.length, limit: FOCUS_LIMIT })}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 p-2">
        <p className={cn("px-1 text-xs text-muted-foreground", full && "text-foreground")}>
          {full ? t("dashboard.focusFull", { limit: FOCUS_LIMIT }) : t("dashboard.focusSlots", { count: FOCUS_LIMIT - focus.length })}
        </p>
        <Input
          aria-label={t("dashboard.searchTasks")}
          placeholder={t("dashboard.searchTasksPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <DataState
          isLoading={tasks.isLoading}
          error={tasks.error}
          isEmpty={candidates.length === 0}
          empty={<p className="px-2 py-4 text-center text-sm text-muted-foreground">{t("dashboard.noFocusCandidates")}</p>}
        >
          <ul className="max-h-64 overflow-y-auto">
            {candidates.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  aria-label={t("dashboard.addToFocus", { title: task.title })}
                  disabled={full || update.isPending}
                  onClick={() => update.mutate({ id: task.id, input: { focusDay: today } }, { onSuccess: () => setSearch("") })}
                  className="flex w-full cursor-pointer flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="w-full truncate text-sm">{task.title}</span>
                  <span className={cn("text-xs text-muted-foreground", isOverdue(task) && "text-destructive")}>
                    {task.dueAt ? t("tasks.dueOn", { date: dueLabel(task) }) : getTaskStatusLabels()[task.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DataState>
        {update.error ? <p role="alert" className="px-1 text-sm text-destructive">{errorMessage(update.error)}</p> : null}
      </PopoverContent>
    </Popover>
  )
}
