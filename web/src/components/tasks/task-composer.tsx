import { useEffect, useEffectEvent, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ListChecks } from "lucide-react"
import { TaskComposerChecklist } from "@/components/tasks/task-composer-checklist"
import { Button } from "@/components/ui/button"
import { useCreateTask } from "@/hooks/queries/use-tasks"
import { draftToInput, emptyDraft, toggleDraftChecklist } from "@/lib/tasks"
import { cn } from "@/lib/utils"

/** "Take a task…": expands to title, notes or a checklist; clicking outside saves and Esc closes. */
export function TaskComposer() {
  const { t } = useTranslation()
  const create = useCreateTask()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const container = useRef<HTMLDivElement>(null)
  const notes = useRef<HTMLTextAreaElement>(null)

  // An empty draft is simply dropped.
  const close = () => {
    const input = draftToInput(draft)
    if (input) create.mutate(input)
    setDraft(emptyDraft())
    setOpen(false)
  }
  const closeOnOutsideClick = useEffectEvent((event: PointerEvent) => {
    if (!container.current?.contains(event.target as Node)) close()
  })

  useEffect(() => {
    if (!open) return
    document.addEventListener("pointerdown", closeOnOutsideClick)
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick)
  }, [open])

  return (
    <div
      ref={container}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return
        event.preventDefault()
        close()
      }}
      className={cn("mx-auto flex w-full max-w-xl flex-col rounded-2xl border bg-card shadow-xs transition-shadow", open && "shadow-md")}
    >
      <div className="flex items-center gap-1 pr-1.5">
        <input
          value={draft.title}
          aria-label={open ? t("common.title") : t("tasks.takeATask")}
          placeholder={open ? t("common.title") : t("tasks.takeATask")}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setOpen(true)
            setDraft({ ...draft, title: event.target.value })
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || draft.checklist) return
            event.preventDefault()
            notes.current?.focus()
          }}
          className={cn("h-11 min-w-0 flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground", open && "font-medium")}
        />
        {open ? null : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("tasks.newChecklist")}
            title={t("tasks.newChecklist")}
            onClick={() => {
              setDraft(toggleDraftChecklist(emptyDraft()))
              setOpen(true)
            }}
          >
            <ListChecks />
          </Button>
        )}
      </div>
      {open ? (
        <div className="flex flex-col gap-2 px-4 pb-2">
          {draft.checklist ? (
            <TaskComposerChecklist items={draft.items} onChange={(items) => setDraft({ ...draft, items })} />
          ) : (
            <textarea
              ref={notes}
              rows={3}
              value={draft.notes}
              aria-label={t("common.notes")}
              placeholder={t("tasks.notesPlaceholder")}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              className="field-sizing-content max-h-80 min-h-16 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          )}
          <div className="-mx-2 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={draft.checklist}
              aria-label={t("tasks.checklistMode")}
              title={t("tasks.checklistMode")}
              className={cn(draft.checklist && "text-primary")}
              onClick={() => setDraft(toggleDraftChecklist(draft))}
            >
              <ListChecks />
            </Button>
            <Button variant="ghost" size="sm" onClick={close}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
