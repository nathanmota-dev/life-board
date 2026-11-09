import { useTranslation } from "react-i18next"
import { ListChecks } from "lucide-react"
import { TaskComposerChecklist } from "@/components/tasks/task-composer-checklist"
import { Button } from "@/components/ui/button"
import { toggleDraftChecklist } from "@/lib/tasks"
import { cn } from "@/lib/utils"
import type { TaskComposerFieldsProps } from "@/types/task"

/** The composer's expanded area: notes or a checklist, plus its mode and close buttons. */
export function TaskComposerFields({ draft, notesRef, onDraftChange, onClose }: TaskComposerFieldsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2 px-4 pb-2">
      {draft.checklist ? (
        <TaskComposerChecklist items={draft.items} onChange={(items) => onDraftChange({ ...draft, items })} />
      ) : (
        <textarea
          ref={notesRef}
          rows={3}
          value={draft.notes}
          aria-label={t("common.notes")}
          placeholder={t("tasks.notesPlaceholder")}
          onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })}
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
          onClick={() => onDraftChange(toggleDraftChecklist(draft))}
        >
          <ListChecks />
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t("common.close")}
        </Button>
      </div>
    </div>
  )
}
