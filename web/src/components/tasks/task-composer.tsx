import { useEffect, useEffectEvent, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ListChecks } from "lucide-react"
import { TaskComposerFields } from "@/components/tasks/task-composer-fields"
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
      {open ? <TaskComposerFields draft={draft} notesRef={notes} onDraftChange={setDraft} onClose={close} /> : null}
    </div>
  )
}
