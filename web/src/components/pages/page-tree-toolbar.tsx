import { useTranslation } from "react-i18next"
import { ChevronsDownUp, FilePlus, FolderPlus } from "lucide-react"
import { PageImportButton } from "@/components/pages/page-import-button"
import { Button } from "@/components/ui/button"
import type { PageTreeToolbarProps } from "@/types/page"

export function PageTreeToolbar({ parentId, allExpanded, onNewPage, onNewFolder, onCollapseAll, onImported }: PageTreeToolbarProps) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1 border-b px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{t("navigation.pages")}</span>
      <Button type="button" size="icon-sm" variant="ghost" aria-label={t("pages.newPage")} title={t("pages.newPage")} onClick={onNewPage}>
        <FilePlus />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label={t("pages.newFolder")} title={t("pages.newFolder")} onClick={onNewFolder}>
        <FolderPlus />
      </Button>
      <PageImportButton parentId={parentId} onImported={onImported} />
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={!allExpanded}
        aria-label={t("pages.collapseAll")}
        title={t("pages.collapseAll")}
        onClick={onCollapseAll}
      >
        <ChevronsDownUp />
      </Button>
    </div>
  )
}
