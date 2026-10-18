import { useState } from "react"
import { FolderKanban, Layers, Plus } from "lucide-react"
import { BoardFiles } from "@/components/file-board/board-files"
import { BoardFormDialog } from "@/components/file-board/board-form-dialog"
import { BoardList } from "@/components/file-board/board-list"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Page, PageSection, Panel } from "@/components/workspace-ui"
import { useFileBoards } from "@/hooks/queries/use-file-boards"

export function FileBoardPage() {
  const boards = useFileBoards()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const items = boards.data ?? []
  const selected = items.find((board) => board.id === selectedId) ?? items[0] ?? null

  return (
    <Page
      title="File Board"
      description="Receipts, photos and documents, organized in boards."
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus />
          New board
        </Button>
      }
    >
      <PageSection>
        <DataState
          isLoading={boards.isLoading}
          error={boards.error}
          isEmpty={items.length === 0}
          empty={
            <EmptyState
              icon={FolderKanban}
              title="No boards yet"
              description="Create a board to start uploading files."
              action={<Button size="sm" onClick={() => setCreating(true)}>Create a board</Button>}
            />
          }
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,3fr)]">
            <Panel title="Boards" icon={Layers} contentClassName="pb-2">
              <BoardList boards={items} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            </Panel>
            {selected ? <BoardFiles key={selected.id} board={selected} onDeleted={() => setSelectedId(null)} /> : null}
          </div>
        </DataState>
      </PageSection>
      <BoardFormDialog
        key={String(creating)}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(board) => setSelectedId(board.id)}
      />
    </Page>
  )
}
