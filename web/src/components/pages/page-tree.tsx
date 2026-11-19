import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "@tanstack/react-router"
import { NotebookText } from "lucide-react"
import { PageDeleteDialog } from "@/components/pages/page-delete-dialog"
import { PageMoveDialog } from "@/components/pages/page-move-dialog"
import { PageTreeDropZone } from "@/components/pages/page-tree-drop-zone"
import { PageTreeList } from "@/components/pages/page-tree-item"
import { PageTreeToolbar } from "@/components/pages/page-tree-toolbar"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { usePages } from "@/hooks/queries/use-pages"
import { useExpandedPages } from "@/hooks/use-expanded-pages"
import { usePageActions } from "@/hooks/use-page-actions"
import { usePageTreeEditing } from "@/hooks/use-page-tree-editing"
import { ancestorIds, buildPageTree, dropUpdate, targetFolderId } from "@/lib/pages"
import type { Page, PageMenuActions, PageTreeProps } from "@/types/page"

/** The folders and pages: expand, create, rename, move (drag or dialog), delete, import. */
export function PageTree({ onOpenPage }: PageTreeProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pageId = null } = useParams({ strict: false })
  const pages = usePages()
  const list = useMemo(() => pages.data ?? [], [pages.data])
  const tree = useMemo(() => buildPageTree(list), [list])
  const { expanded, toggle, expand, collapseAll } = useExpandedPages()
  const [selectedId, setSelectedId] = useState<string | null>(pageId)
  const [lastPageId, setLastPageId] = useState(pageId)
  const [moving, setMoving] = useState<Page | null>(null)
  const [deleting, setDeleting] = useState<Page | null>(null)
  const actions = usePageActions(pageId, (parentId) => parentId && expand([parentId]))
  const editing = usePageTreeEditing(actions, (id) => expand([id]))
  const parentId = targetFolderId(list, selectedId)

  // The open page is the selected one, and its folders open so it can be seen.
  if (pageId !== lastPageId) {
    setLastPageId(pageId)
    if (pageId) setSelectedId(pageId)
  }
  useEffect(() => {
    if (pageId && list.length > 0) expand(ancestorIds(list, pageId))
  }, [expand, list, pageId])

  const menu: PageMenuActions = {
    onNewPage: (folderId) => editing.startDraft("page", folderId),
    onNewFolder: (folderId) => editing.startDraft("folder", folderId),
    onRename: editing.startRename,
    onMove: setMoving,
    onDelete: setDeleting,
    onDownload: (node) => void actions.download(node),
  }

  function select(node: Page) {
    setSelectedId(node.id)
    if (node.kind === "folder") toggle(node.id)
    else {
      void navigate({ to: "/pages/$pageId", params: { pageId: node.id } })
      onOpenPage?.()
    }
  }

  function onDrop(activeId: string, overId: string | null) {
    const change = dropUpdate(list, activeId, overId)
    const node = list.find((page) => page.id === activeId)
    if (change && node) actions.move(node, change.parentId ?? null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageTreeToolbar
        parentId={parentId}
        allExpanded={expanded.size > 0}
        onNewPage={() => editing.startDraft("page", parentId)}
        onNewFolder={() => editing.startDraft("folder", parentId)}
        onCollapseAll={collapseAll}
        onImported={(folderId) => folderId && expand([folderId])}
      />
      <PageTreeDropZone onDrop={onDrop}>
        <DataState
          isLoading={pages.isLoading}
          error={pages.error}
          isEmpty={tree.length === 0 && editing.draft === null}
          empty={<EmptyState icon={NotebookText} title={t("pages.empty")} description={t("pages.emptyDescription")} />}
        >
          <PageTreeList
            tree={tree}
            expanded={expanded}
            selectedId={selectedId}
            renamingId={editing.renamingId}
            draft={editing.draft}
            actions={menu}
            onSelect={select}
            onToggle={toggle}
            onRenameSubmit={editing.submitRename}
            onRenameCancel={editing.cancelRename}
            onDraftSubmit={editing.submitDraft}
            onDraftCancel={editing.cancelDraft}
          />
        </DataState>
      </PageTreeDropZone>
      <PageMoveDialog node={moving} onClose={() => setMoving(null)} onMove={actions.move} />
      <PageDeleteDialog node={deleting} onClose={() => setDeleting(null)} onDelete={actions.remove} />
    </div>
  )
}
