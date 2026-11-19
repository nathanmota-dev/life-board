import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { applySavedPageContent } from "@/hooks/queries/use-pages"
import { useAutosavedText } from "@/hooks/use-autosaved-text"
import { pagesService } from "@/services/pages-service"
import type { Page, PageEditorState } from "@/types/page"

/** The text of a page being edited, saved back to its file. */
export function usePageEditor(page: Page, text: string): PageEditorState {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const save = useCallback(
    async (content: string) => {
      const saved = await pagesService.saveContent(page.id, content)
      applySavedPageContent(queryClient, saved, content)
    },
    [page.id, queryClient],
  )
  const editor = useAutosavedText({
    text,
    save,
    savedMessage: t("pages.saved"),
    alreadySavedMessage: t("pages.alreadySaved"),
  })

  return {
    ...editor,
    field: {
      value: editor.value,
      label: t("pages.content", { title: page.title }),
      onChange: editor.setValue,
      onSaveShortcut: () => void editor.saveNow(),
    },
  }
}
