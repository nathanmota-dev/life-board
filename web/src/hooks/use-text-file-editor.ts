import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { applySavedText } from "@/hooks/queries/use-file-boards"
import { useAutosavedText } from "@/hooks/use-autosaved-text"
import { fileLabel } from "@/lib/file-board"
import { fileBoardsService } from "@/services/file-boards-service"
import type { FileItem } from "@/types/file-board"
import type { PlainTextAreaProps } from "@/types/page"

/** The text of a `.txt`/`.md` file being edited, saved back to the file. */
export function useTextFileEditor(item: FileItem, text: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const save = useCallback(
    async (content: string) => {
      const saved = await fileBoardsService.saveText(item.id, content)
      applySavedText(queryClient, saved, content)
    },
    [item.id, queryClient],
  )
  const editor = useAutosavedText({
    text,
    save,
    savedMessage: t("fileBoard.saved"),
    alreadySavedMessage: t("fileBoard.alreadySaved"),
  })

  const field: PlainTextAreaProps = {
    value: editor.value,
    label: t("fileBoard.fileContent", { title: fileLabel(item) }),
    onChange: editor.setValue,
    onSaveShortcut: () => void editor.saveNow(),
  }

  return { ...editor, field }
}
