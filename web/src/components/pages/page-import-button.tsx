import { useRef, useState, type ChangeEvent } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { FileUp, FolderUp, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { queryKeys } from "@/hooks/queries/query-keys"
import { errorMessage } from "@/lib/format"
import { importFolderPath, isMarkdownFile } from "@/lib/pages"
import { pagesService } from "@/services/pages-service"
import type { ImportableFile, ImportSummary, PageImportButtonProps } from "@/types/page"

/** Sends the files one at a time, so the order is kept and one bad file doesn't stop the rest. */
async function importFiles(files: ImportableFile[], parentId: string | null): Promise<ImportSummary> {
  const summary = { imported: 0, skipped: 0 }
  for (const file of files) {
    if (!isMarkdownFile(file)) {
      summary.skipped += 1
      continue
    }
    try {
      await pagesService.importFile({ file, parentId, folderPath: importFolderPath(file) })
      summary.imported += 1
    } catch {
      summary.skipped += 1
    }
  }
  return summary
}

/** "Import .md" (several files) and "Import folder" (a whole folder, structure included) into the selected folder. */
export function PageImportButton({ parentId, onImported }: PageImportButtonProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const filesInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const files = [...(input.files ?? [])] as ImportableFile[]
    input.value = ""
    if (files.length === 0) return
    setBusy(true)
    try {
      const summary = await importFiles(files, parentId)
      await queryClient.invalidateQueries({ queryKey: queryKeys.pages })
      onImported(parentId)
      toast.success(t("pages.importResult", summary))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon-sm" variant="ghost" disabled={busy} aria-label={t("pages.import")} title={t("pages.import")}>
            <Upload />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => filesInput.current?.click()}>
            <FileUp />
            {t("pages.importFiles")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => folderInput.current?.click()}>
            <FolderUp />
            {t("pages.importFolder")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={filesInput}
        type="file"
        multiple
        accept=".md,.markdown"
        hidden
        aria-label={t("pages.importFilesInput")}
        onChange={(event) => void onChange(event)}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        aria-label={t("pages.importFolderInput")}
        {...{ webkitdirectory: "" }}
        onChange={(event) => void onChange(event)}
      />
    </>
  )
}
