import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { errorMessage } from "@/lib/format"
import type { AutosavedText, AutosavedTextOptions } from "@/types/page"

/** Saves this long after the last keystroke. */
export const AUTOSAVE_DELAY_MS = 1500

/**
 * A text being edited: saved automatically after a pause in typing, on demand (`saveNow`) and
 * when the screen closes with unsaved changes. Saves run one at a time, in order, so an older
 * text never overwrites a newer one. What a save does is up to `save`.
 */
export function useAutosavedText({ text, save, savedMessage, alreadySavedMessage }: AutosavedTextOptions): AutosavedText {
  const [draft, setDraft] = useState<string | null>(null)
  const [savedText, setSavedText] = useState<string | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const saveRef = useRef(save)
  const latest = useRef({ value: text, dirty: false })
  const value = draft ?? text
  const dirty = draft !== null && draft !== (savedText ?? text)

  useEffect(() => {
    saveRef.current = save
  }, [save])

  const persist = useCallback((content: string) => {
    const run = queue.current
      .catch(() => undefined)
      .then(async () => {
        await saveRef.current(content)
        setSavedText(content)
      })
    queue.current = run
    return run
  }, [])

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

  // Leaving the screen (back button, sidebar, another page) saves what the pause didn't reach yet.
  useEffect(
    () => () => {
      if (latest.current.dirty) persist(latest.current.value).catch((error: unknown) => toast.error(errorMessage(error)))
    },
    [persist],
  )

  const saveNow = useCallback(async () => {
    if (!dirty) {
      toast.info(alreadySavedMessage)
      return
    }
    try {
      await persist(value)
      toast.success(savedMessage)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }, [alreadySavedMessage, dirty, persist, savedMessage, value])

  return { value, setValue: setDraft, dirty, saveNow }
}
