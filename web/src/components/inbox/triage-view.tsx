import { InboxZero } from "@/components/inbox/inbox-zero"
import { TriageActions } from "@/components/inbox/triage-actions"
import { TriageCard } from "@/components/inbox/triage-card"
import { TriageDatePicker } from "@/components/inbox/triage-date-picker"
import { TaskFormDialog } from "@/components/tasks/task-form-dialog"
import { useTriage } from "@/hooks/use-triage"
import { errorMessage } from "@/lib/format"
import type { TriageViewProps } from "@/types/inbox"

export function TriageView({ tasks, onExit }: TriageViewProps) {
  const triage = useTriage(tasks, onExit)
  const { current } = triage

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-6 py-8">
      {current ? (
        <>
          <TriageCard task={current} position={triage.position} total={triage.total} />
          {triage.mode === "date" ? (
            <TriageDatePicker disabled={triage.busy} onConfirm={triage.confirmDate} onCancel={triage.closeOverlay} />
          ) : null}
          <TriageActions disabled={triage.busy || triage.mode !== "idle"} canUndo={triage.canUndo} onAction={triage.perform} />
        </>
      ) : (
        <InboxZero count={triage.triaged} canUndo={triage.canUndo && !triage.busy} onUndo={() => triage.perform("undo")} onExit={onExit} />
      )}
      {triage.error ? <p role="alert" className="text-sm text-destructive">{errorMessage(triage.error)}</p> : null}
      {triage.mode === "edit" && current ? (
        <TaskFormDialog open task={current} onOpenChange={(open) => !open && triage.closeOverlay()} />
      ) : null}
    </div>
  )
}
