import { useTranslation } from "react-i18next"
import { Folder, FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { usePages } from "@/hooks/queries/use-pages"
import { buildPageTree, canMovePage } from "@/lib/pages"
import type { Page, PageMoveDialogProps, PageNode } from "@/types/page"

type FolderOptionProps = { node: PageNode; depth: number; pages: Page[]; moving: Page; onPick: (parentId: string | null) => void }

/** A folder to move into, followed by the folders inside it. */
function FolderOption({ node, depth, pages, moving, onPick }: FolderOptionProps) {
  return (
    <li>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        style={{ paddingLeft: `${0.75 + depth * 0.9}rem` }}
        disabled={!canMovePage(pages, moving.id, node.id)}
        onClick={() => onPick(node.id)}
      >
        <Folder />
        <span className="truncate">{node.title}</span>
      </Button>
      {node.children.some((child) => child.kind === "folder") ? (
        <ul>
          {node.children
            .filter((child) => child.kind === "folder")
            .map((child) => (
              <FolderOption key={child.id} node={child} depth={depth + 1} pages={pages} moving={moving} onPick={onPick} />
            ))}
        </ul>
      ) : null}
    </li>
  )
}

/** "Move to…": the folder tree, so an item can be moved without a mouse. */
export function PageMoveDialog({ node, onClose, onMove }: PageMoveDialogProps) {
  const { t } = useTranslation()
  const pages = usePages().data ?? []
  const folders = buildPageTree(pages).filter((root) => root.kind === "folder")
  const pick = (parentId: string | null) => {
    if (node) onMove(node, parentId)
    onClose()
  }

  return (
    <Dialog open={node !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("pages.moveTitle", { title: node?.title })}</DialogTitle>
          <DialogDescription>{t("pages.moveDescription")}</DialogDescription>
        </DialogHeader>
        {node ? (
          <ul className="flex flex-col gap-0.5">
            <li>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                disabled={!canMovePage(pages, node.id, null)}
                onClick={() => pick(null)}
              >
                <FolderOpen />
                {t("pages.root")}
              </Button>
            </li>
            {folders.map((folder) => (
              <FolderOption key={folder.id} node={folder} depth={0} pages={pages} moving={node} onPick={pick} />
            ))}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
