import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { usePages } from "@/hooks/queries/use-pages"
import { countPagesIn } from "@/lib/pages"
import type { PageDeleteDialogProps } from "@/types/page"

/** Deleting is permanent, so it is confirmed; a folder says how many pages go with it. */
export function PageDeleteDialog({ node, onClose, onDelete }: PageDeleteDialogProps) {
  const { t } = useTranslation()
  const pages = usePages()
  const count = node?.kind === "folder" ? countPagesIn(pages.data ?? [], node.id) : 0

  return (
    <Dialog open={node !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("pages.deleteTitle", { title: node?.title })}</DialogTitle>
          <DialogDescription>
            {node?.kind === "folder" ? t("pages.deleteFolderDescription", { count }) : t("pages.deletePageDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (node) onDelete(node)
              onClose()
            }}
          >
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
