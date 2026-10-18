import { useState } from "react"
import { FolderOpen, Trash2 } from "lucide-react"
import { FileItemDialog } from "@/components/file-board/file-item-dialog"
import { FileItemGrid } from "@/components/file-board/file-item-grid"
import { UploadButton } from "@/components/file-board/upload-button"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/workspace-ui"
import { useFileItems, useRemoveBoard } from "@/hooks/queries/use-file-boards"
import type { BoardFilesProps, FileItem } from "@/types/file-board"

export function BoardFiles({ board, onDeleted }: BoardFilesProps) {
  const items = useFileItems(board.id)
  const removeBoard = useRemoveBoard()
  const [openItem, setOpenItem] = useState<FileItem | null>(null)
  const files = items.data ?? []

  return (
    <Panel
      title={board.name}
      action={
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Delete ${board.name}`}
            onClick={() => removeBoard.mutate(board.id, { onSuccess: onDeleted })}
          >
            <Trash2 />
          </Button>
          <UploadButton boardId={board.id} />
        </div>
      }
    >
      {board.description ? <p className="mb-4 text-sm text-muted-foreground">{board.description}</p> : null}
      <DataState
        isLoading={items.isLoading}
        error={items.error}
        isEmpty={files.length === 0}
        empty={<EmptyState icon={FolderOpen} title="This board is empty" description="Upload photos, receipts or documents (up to 20 MB each)." />}
      >
        <FileItemGrid items={files} onOpen={setOpenItem} />
      </DataState>
      <FileItemDialog item={openItem} onClose={() => setOpenItem(null)} />
    </Panel>
  )
}
