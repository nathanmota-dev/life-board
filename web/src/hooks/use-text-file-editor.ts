import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { applySavedText } from "@/hooks/queries/use-file-boards"
import { errorMessage } from "@/lib/format"
import { fileBoardsService } from "@/services/file-boards-service"
import type { FileItem } from "@/types/file-board"

/** Saves this long after the last keystroke. */
export const AUTOSAVE_DELAY_MS = 1500

/**
 * The text of a `.txt`/`.md` file being edited: saved automatically after a pause in typing,
 * on demand (`saveNow`) and when the page closes with unsaved changes. Saves run one at a
 * time, in order, so an older text never overwrites a newer one.
 */
export function useTextFileEditor(item: FileItem, text: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<string | null>(null)
  const [savedText, setSavedText] = useState<string | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const latest = useRef({ value: text, dirty: false })
  const value = draft ?? text
  const dirty = draft !== null && draft !== (savedText ?? text)

  const persist = useCallback(
    (content: string) => {
      const run = queue.current
        .catch(() => undefined)
        .then(async () => {
          const saved = await fileBoardsService.saveText(item.id, content)
          applySavedText(queryClient, saved, content)
          setSavedText(content)
        })
      queue.current = run
      return run
    },
    [item.id, queryClient],
  )

  useEffect(() => {
    latest.current = { value, dirty }
  }, [value, dirty])

  useEffect(() => {
    if (!dirty) return
    const timer = window.setTimeout(() => {
      persist(value).catch((error: unknown) => toast.error(errorMessage(error)))
    }, AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [dirty, persist, value])

  // Leaving the page (back button, sidebar) saves what the pause didn't reach yet.
  useEffect(
    () => () => {
      if (latest.current.dirty) persist(latest.current.value).catch((error: unknown) => toast.error(errorMessage(error)))
    },
    [persist],
  )

  const saveNow = useCallback(async () => {
    if (!dirty) {
      toast.info(t("fileBoard.alreadySaved"))
      return
    }
    try {
      await persist(value)
      toast.success(t("fileBoard.saved"))
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }, [dirty, persist, t, value])

  return { value, setValue: setDraft, dirty, saveNow }
}
