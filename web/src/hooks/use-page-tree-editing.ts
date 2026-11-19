import { useState } from "react"
import type { PageDraft } from "@/types/page"

type EditingActions = {
  create: (draft: PageDraft, title: string) => void
  rename: (id: string, title: string) => void
}

/** The title being typed in the tree: either a new folder or page, or the new name of an existing one. */
export function usePageTreeEditing(actions: EditingActions, openFolder: (id: string) => void) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PageDraft | null>(null)

  return {
    renamingId,
    draft,
    startDraft: (kind: PageDraft["kind"], parentId: string | null) => {
      setRenamingId(null)
      setDraft({ kind, parentId })
      if (parentId) openFolder(parentId)
    },
    startRename: (id: string) => {
      setDraft(null)
      setRenamingId(id)
    },
    submitRename: (id: string, title: string) => {
      setRenamingId(null)
      actions.rename(id, title)
    },
    cancelRename: () => setRenamingId(null),
    submitDraft: (title: string) => {
      if (draft) actions.create(draft, title)
      setDraft(null)
    },
    cancelDraft: () => setDraft(null),
  }
}
