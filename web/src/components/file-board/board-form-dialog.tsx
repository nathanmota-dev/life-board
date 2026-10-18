import { useState } from "react"
import { DialogForm } from "@/components/shared/dialog-form"
import { FormField } from "@/components/shared/form-field"
import { SelectField } from "@/components/shared/select-field"
import { Input } from "@/components/ui/input"
import { useCreateBoard } from "@/hooks/queries/use-file-boards"
import { BOARD_KIND_OPTIONS } from "@/lib/file-board"
import type { BoardFormDialogProps, BoardKind, FileBoard } from "@/types/file-board"

export function BoardFormDialog({ open, onOpenChange, onCreated }: BoardFormDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [kind, setKind] = useState<BoardKind>("other")
  const create = useCreateBoard()

  return (
    <DialogForm
      open={open}
      onOpenChange={onOpenChange}
      title="New board"
      description="Group receipts, photos or documents together."
      submitLabel="Create board"
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
      <FormField label="Name" htmlFor="board-name">
        <Input id="board-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Receipts 2026" />
      </FormField>
      <FormField label="Description" htmlFor="board-description">
        <Input id="board-description" value={description} onChange={(event) => setDescription(event.target.value)} />
      </FormField>
      <FormField label="Kind" htmlFor="board-kind">
        <SelectField id="board-kind" value={kind} options={BOARD_KIND_OPTIONS} onChange={setKind} />
      </FormField>
    </DialogForm>
  )
}
