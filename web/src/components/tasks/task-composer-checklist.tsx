import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Square } from "lucide-react"
import { insertDraftItem, removeDraftItem } from "@/lib/tasks"
import type { TaskComposerChecklistProps, TaskDraftItem } from "@/types/task"

/** Draft checklist items: Enter adds one below, Backspace on an empty item removes it. */
export function TaskComposerChecklist({ items, onChange }: TaskComposerChecklistProps) {
  const { t } = useTranslation()
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const pendingFocus = useRef<string | null>(null)

  useEffect(() => {
    if (!pendingFocus.current) return
    inputs.current.get(pendingFocus.current)?.focus()
    pendingFocus.current = null
  })

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, item: TaskDraftItem) => {
    const next =
      event.key === "Enter" ? insertDraftItem(items, item.id) : event.key === "Backspace" && item.text === "" ? removeDraftItem(items, item.id) : null
    if (!next) return
    event.preventDefault()
    pendingFocus.current = next.focusId
    onChange(next.items)
  }

  return (
    <ul aria-label={t("tasks.checklist")} className="flex flex-col gap-1">
      {items.map((item, index) => (
        <li key={item.id} className="flex items-center gap-2">
          <Square className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={(node) => {
              if (node) inputs.current.set(item.id, node)
              else inputs.current.delete(item.id)
            }}
            value={item.text}
            aria-label={t("tasks.checklistItem", { index: index + 1 })}
            placeholder={t("tasks.listItem")}
            onChange={(event) => onChange(items.map((current) => (current.id === item.id ? { ...current, text: event.target.value } : current)))}
            onKeyDown={(event) => handleKeyDown(event, item)}
            className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </li>
      ))}
    </ul>
  )
}
