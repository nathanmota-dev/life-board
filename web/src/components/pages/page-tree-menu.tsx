import { useTranslation } from "react-i18next"
import { Download, FilePlus, FolderInput, FolderPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { PageTreeMenuProps } from "@/types/page"

/** What can be done to a folder or page; opened from the "…" button, a right click or the context menu key. */
export function PageTreeMenu({ node, open, onOpenChange, actions }: PageTreeMenuProps) {
  const { t } = useTranslation()
  const isFolder = node.kind === "folder"

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          tabIndex={-1}
          aria-label={t("pages.actionsFor", { title: node.title })}
          className="shrink-0 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 data-[state=open]:opacity-100"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      {/* Not modal, and no focus handed back to its button on close: both would take the focus from the title being typed. */}
      <DropdownMenuContent align="start" onClick={(event) => event.stopPropagation()} onCloseAutoFocus={(event) => event.preventDefault()}>
        {isFolder ? (
          <>
            <DropdownMenuItem onSelect={() => actions.onNewPage(node.id)}>
              <FilePlus />
              {t("pages.newPage")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.onNewFolder(node.id)}>
              <FolderPlus />
              {t("pages.newFolder")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onSelect={() => actions.onRename(node.id)}>
          <Pencil />
          {t("pages.rename")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onMove(node)}>
          <FolderInput />
          {t("pages.moveTo")}
        </DropdownMenuItem>
        {isFolder ? null : (
          <DropdownMenuItem onSelect={() => actions.onDownload(node)}>
            <Download />
            {t("pages.download")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(node)}>
          <Trash2 />
          {t("common.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
