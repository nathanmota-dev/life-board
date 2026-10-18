import { FileItemForm } from "@/components/file-board/file-item-form"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { fileLabel } from "@/lib/file-board"
import type { FileItemDialogProps } from "@/types/file-board"

export function FileItemDialog({ item, onClose }: FileItemDialogProps) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{item ? fileLabel(item) : "File"}</DialogTitle>
          <DialogDescription className="sr-only">Preview and edit this file</DialogDescription>
        </DialogHeader>
        {item ? <FileItemForm key={item.id} item={item} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}
