import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Checkbox } from "@/components/ui/checkbox"
import { checklistView } from "@/lib/tasks"
import { cn, stopCardEvents } from "@/lib/utils"
import type { TaskChecklistProps } from "@/types/task"

/** Checklist items on a card: open ones first, ticked ones struck through below and collapsed after three. */
export function TaskChecklist({ items, onToggle }: TaskChecklistProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const view = checklistView(items, expanded)
  const collapsible = view.hiddenDone > 0 || (expanded && view.done.length > 3)

  return (
    <div className="flex flex-col gap-1">
      <ul aria-label={t("tasks.checklist")} className="flex flex-col gap-1">
        {[...view.open, ...view.done].map((item, index) => {
          const done = item.status === "done"
          return (
            <li key={item.id} className={cn("flex items-start gap-2 text-sm", done && index === view.open.length && index > 0 && "mt-1 border-t pt-2")}>
              <Checkbox
                {...stopCardEvents}
                checked={done}
                aria-label={done ? t("common.reopen", { title: item.title }) : t("common.complete", { title: item.title })}
                onCheckedChange={() => onToggle(item)}
                className="mt-0.5 bg-background"
              />
              <span className={cn("min-w-0 break-words", done && "text-muted-foreground line-through")}>{item.title}</span>
            </li>
          )
        })}
      </ul>
      {collapsible ? (
        <button
          type="button"
          onPointerDown={stopCardEvents.onPointerDown}
          onClick={(event) => {
            event.stopPropagation()
            setExpanded((current) => !current)
          }}
          className="cursor-pointer self-start pl-6 text-xs text-muted-foreground hover:text-foreground hover:underline">
          {expanded ? t("tasks.showLess") : t("tasks.moreDone", { count: view.hiddenDone })}
        </button>
      ) : null}
    </div>
  )
}
