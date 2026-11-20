import { lazy, Suspense, useEffect, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/pages/page-header"
import { PageReader } from "@/components/pages/page-reader"
import { Skeleton } from "@/components/ui/skeleton"
import { usePages, useUpdatePage } from "@/hooks/queries/use-pages"
import { usePageEditor } from "@/hooks/use-page-editor"
import { saveTextFile } from "@/lib/download"
import { errorMessage } from "@/lib/format"
import { isEditShortcut } from "@/lib/keyboard"
import { downloadFileName, pageAncestors } from "@/lib/pages"
import { pagesService } from "@/services/pages-service"
import type { PageDocumentProps } from "@/types/page"

// The editor library only loads when a page is edited.
const PageEditor = lazy(() => import("@/components/pages/page-editor"))

/** Esc leaves the editor only when it isn't being used to select text or close something else. */
function leavesEditor(event: KeyboardEvent) {
  return event.key === "Escape" && !event.defaultPrevented && (window.getSelection()?.isCollapsed ?? true)
}

/** An open page: read by default, edited in place, and saved as it's typed. */
export function PageDocument({ page, content, initialEditing }: PageDocumentProps) {
  const pages = usePages()
  const update = useUpdatePage()
  const editor = usePageEditor(page, content)
  const [editing, setEditing] = useState(initialEditing)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditShortcut(event)) {
        event.preventDefault()
        setEditing((current) => !current)
      } else if (leavesEditor(event)) {
        setEditing(false)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  async function download() {
    try {
      if (editor.dirty) await editor.saveNow()
      const stored = await pagesService.content(page.id)
      saveTextFile(downloadFileName(page.title), stored.content)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        page={page}
        ancestors={pageAncestors(pages.data ?? [], page.id)}
        editing={editing}
        dirty={editor.dirty}
        onToggleEditing={() => setEditing((current) => !current)}
        onSave={() => void editor.saveNow()}
        onRename={(title) => update.mutate({ id: page.id, input: { title } }, { onError: (error) => toast.error(errorMessage(error)) })}
        onDownload={() => void download()}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
        {editing ? (
          <Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl" />}>
            <PageEditor editor={editor} />
          </Suspense>
        ) : (
          <PageReader markdown={editor.value} />
        )}
      </div>
    </div>
  )
}
