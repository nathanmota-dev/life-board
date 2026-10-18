import { useState } from "react"
import { Trash2 } from "lucide-react"
import { FileThumbnail } from "@/components/file-board/file-thumbnail"
import { FormField } from "@/components/shared/form-field"
import { SelectField } from "@/components/shared/select-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useRemoveFileItem, useUpdateFileItem } from "@/hooks/queries/use-file-boards"
import { FILE_KIND_OPTIONS } from "@/lib/file-board"
import { errorMessage, formatBytes } from "@/lib/format"
import type { FileItemFormProps, FileKind } from "@/types/file-board"

export function FileItemForm({ item, onClose }: FileItemFormProps) {
  const [title, setTitle] = useState(item.title ?? "")
  const [notes, setNotes] = useState(item.notes ?? "")
  const [kind, setKind] = useState<FileKind>(item.kind)
  const update = useUpdateFileItem()
  const remove = useRemoveFileItem()

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        update.mutate({ id: item.id, input: { title: title.trim() || null, notes: notes.trim() || null, kind } }, { onSuccess: onClose })
      }}
    >
      <FileThumbnail item={item} className="max-h-80 min-h-40 rounded-xl border [&>img]:object-contain" />
      <p className="text-xs text-muted-foreground">
        {item.mime} · {formatBytes(item.sizeBytes)}
      </p>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <FormField label="Title" htmlFor="file-title">
          <Input id="file-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </FormField>
        <FormField label="Kind" htmlFor="file-kind">
          <SelectField id="file-kind" value={kind} options={FILE_KIND_OPTIONS} onChange={setKind} />
        </FormField>
      </div>
      <FormField label="Notes" htmlFor="file-notes">
        <Textarea id="file-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </FormField>
      {update.error || remove.error ? <p className="text-sm text-destructive">{errorMessage(update.error ?? remove.error)}</p> : null}
      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" className="text-destructive" onClick={() => remove.mutate(item.id, { onSuccess: onClose })}>
          <Trash2 />
          Delete
        </Button>
        <Button type="submit" disabled={update.isPending}>
          Save
        </Button>
      </div>
    </form>
  )
}
