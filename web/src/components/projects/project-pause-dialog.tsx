import { useTranslation } from "react-i18next"
import { useState } from "react"
import { DialogForm } from "@/components/shared/dialog-form"
import { FormField } from "@/components/shared/form-field"
import { Input } from "@/components/ui/input"
import type { ProjectPauseDialogProps } from "@/types/project"

/** Asks for an optional reason before a project moves to Paused. Closing it cancels the move. */
export function ProjectPauseDialog({ move, onConfirm, onCancel }: ProjectPauseDialogProps) {
  const { t } = useTranslation()
  const [reason, setReason] = useState("")

  return (
    <DialogForm
      open={move !== null}
      onOpenChange={(open) => !open && onCancel()}
      title={t("projects.pauseTitle")}
      description={t("projects.pauseDescription")}
      submitLabel={t("projects.pause")}
      isPending={false}
      onSubmit={() => move && onConfirm({ id: move.id, input: { ...move.input, pauseReason: reason.trim() || null } })}
    >
      <FormField label={t("projects.pauseReason")} htmlFor="project-pause-reason" hint={t("common.optional")}>
        <Input
          id="project-pause-reason"
          autoFocus
          maxLength={200}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("projects.pauseReasonPlaceholder")}
        />
      </FormField>
    </DialogForm>
  )
}
