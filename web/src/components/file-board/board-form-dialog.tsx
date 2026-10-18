import { useTranslation } from "react-i18next"
import { useState } from "react"
import { DialogForm } from "@/components/shared/dialog-form"
import { FormField } from "@/components/shared/form-field"
import { SelectField } from "@/components/shared/select-field"
import { Input } from "@/components/ui/input"
import { useCreateBoard } from "@/hooks/queries/use-file-boards"
import { getBoardKindOptions } from "@/lib/file-board"
import type { BoardFormDialogProps, BoardKind, FileBoard } from "@/types/file-board"

export function BoardFormDialog({ open, onOpenChange, onCreated }: BoardFormDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [kind, setKind] = useState<BoardKind>("other")
  const create = useCreateBoard()

  return (
    <DialogForm
      open={open}
      onOpenChange={onOpenChange}
      title={t("fileBoard.newBoard")}
      description={t("fileBoard.groupDescription")}
      submitLabel={t("fileBoard.createBoard")}
      isPending={create.isPending}
      error={create.error}
      onSubmit={() => {
        const created = {
          onSuccess: (board: FileBoard) => {
            onCreated(board)
            onOpenChange(false)
          },
        }
        if (name.trim()) create.mutate({ name: name.trim(), description: description.trim() || null, kind }, created)
      }}
    >
      <FormField label={t("common.name")} htmlFor="board-name">
        <Input id="board-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t("fileBoard.namePlaceholder")} />
      </FormField>
      <FormField label={t("common.description")} htmlFor="board-description">
        <Input id="board-description" value={description} onChange={(event) => setDescription(event.target.value)} />
      </FormField>
      <FormField label={t("fileBoard.kind")} htmlFor="board-kind">
        <SelectField id="board-kind" value={kind} options={getBoardKindOptions()} onChange={setKind} />
      </FormField>
    </DialogForm>
  )
}
