import { useTranslation } from "react-i18next"
import { Crosshair, X } from "lucide-react"
import { FocusRollover } from "@/components/dashboard/focus-rollover"
import { FocusTaskPicker } from "@/components/dashboard/focus-task-picker"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Panel } from "@/components/workspace-ui"
import { useTasks, useUpdateTask } from "@/hooks/queries/use-tasks"
import { useNow } from "@/hooks/use-now"
import { FOCUS_LIMIT, unfinishedFocus } from "@/lib/dashboard"
import { addDays, toDayKey } from "@/lib/dates"
import { errorMessage } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { FocusTaskListProps } from "@/types/dashboard"

function FocusTaskList({ tasks }: FocusTaskListProps) {
  const { t } = useTranslation()
  const update = useUpdateTask()

  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y rounded-xl border">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-3 px-3 py-2.5">
            <Checkbox
              aria-label={t("common.complete", { title: task.title })}
              checked={task.status === "done"}
              onCheckedChange={(checked) => update.mutate({ id: task.id, input: { status: checked === true ? "done" : "today" } })}
            />
            <p className={cn("min-w-0 flex-1 truncate text-sm font-medium", task.status === "done" && "text-muted-foreground line-through")}>
              {task.title}
            </p>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("dashboard.removeFromFocus", { title: task.title })}
              onClick={() => update.mutate({ id: task.id, input: { focusDay: null } })}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
      {update.error ? <p role="alert" className="text-sm text-destructive">{errorMessage(update.error)}</p> : null}
    </div>
  )
}

/** Up to three tasks picked for today, completed inline; yesterday's open ones are offered again. */
export function FocusTasks() {
  const { t } = useTranslation()
  const now = useNow(60_000)
  const today = toDayKey(now)
  const focus = useTasks({ focusDay: today, limit: 10 })
  const yesterday = useTasks({ focusDay: toDayKey(addDays(now, -1)), limit: 10 })
  const items = focus.data ?? []
  const unfinished = unfinishedFocus(yesterday.data ?? [])

  return (
    <Panel title={t("dashboard.widgets.focus")} icon={Crosshair} action={<FocusTaskPicker today={today} focus={items} />}>
      <div className="flex flex-col gap-3">
        {unfinished.length > 0 && !focus.isLoading ? (
          <FocusRollover today={today} unfinished={unfinished} freeSlots={FOCUS_LIMIT - items.length} />
        ) : null}
        <DataState
          isLoading={focus.isLoading}
          error={focus.error}
          isEmpty={items.length === 0}
          empty={<EmptyState icon={Crosshair} title={t("dashboard.focusEmpty")} description={t("dashboard.focusEmptyDescription")} className="py-6" />}
        >
          <FocusTaskList tasks={items} />
        </DataState>
      </div>
    </Panel>
  )
}
