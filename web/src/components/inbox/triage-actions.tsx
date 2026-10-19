import { useTranslation } from "react-i18next"
import { ArrowRight, CalendarClock, CalendarDays, Lightbulb, LogOut, Pencil, Sun, Trash2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TRIAGE_KEY_HINTS } from "@/lib/triage"
import type { TriageActionOption, TriageActionsProps } from "@/types/inbox"

export function TriageActions({ disabled, canUndo, onAction }: TriageActionsProps) {
  const { t } = useTranslation()
  const decisions: TriageActionOption[] = [
    { action: "today", label: t("taskStatuses.today"), icon: Sun },
    { action: "upcoming", label: t("taskStatuses.upcoming"), icon: CalendarDays },
    { action: "someday", label: t("taskStatuses.someday"), icon: CalendarClock },
    { action: "thought", label: t("inbox.toThought"), icon: Lightbulb },
  ]
  const tools: TriageActionOption[] = [
    { action: "edit", label: t("common.edit"), icon: Pencil },
    { action: "delete", label: t("common.delete"), icon: Trash2 },
    { action: "skip", label: t("inbox.skip"), icon: ArrowRight },
    { action: "undo", label: t("inbox.undo"), icon: Undo2 },
    { action: "exit", label: t("inbox.leaveTriage"), icon: LogOut },
  ]

  return (
    <div role="group" aria-label={t("inbox.triageActions")} className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {decisions.map(({ action, label, icon: Icon }) => (
          <Button
            key={action}
            variant="outline"
            className="h-auto justify-start py-3"
            disabled={disabled}
            aria-keyshortcuts={TRIAGE_KEY_HINTS[action]}
            onClick={() => onAction(action)}
          >
            <Icon className="text-primary" />
            {label}
            <kbd aria-hidden="true" className="ml-auto rounded border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground">
              {TRIAGE_KEY_HINTS[action]}
            </kbd>
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {tools.map(({ action, label, icon: Icon }) => (
          <Button
            key={action}
            variant="ghost"
            size="sm"
            disabled={action === "exit" ? false : disabled || (action === "undo" && !canUndo)}
            aria-keyshortcuts={TRIAGE_KEY_HINTS[action]}
            onClick={() => onAction(action)}
          >
            <Icon />
            {label}
            <kbd aria-hidden="true" className="rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
              {TRIAGE_KEY_HINTS[action]}
            </kbd>
          </Button>
        ))}
      </div>
    </div>
  )
}
