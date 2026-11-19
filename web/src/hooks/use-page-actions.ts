import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { useCreatePage, usePages, useRemovePage, useUpdatePage } from "@/hooks/queries/use-pages"
import { saveTextFile } from "@/lib/download"
import { errorMessage } from "@/lib/format"
import { downloadFileName, pageDescendants } from "@/lib/pages"
import { pagesService } from "@/services/pages-service"
import type { Page, PageDraft } from "@/types/page"

const onError = (error: unknown) => toast.error(errorMessage(error))

/** What the tree does to the pages: create, rename, move, delete and download, with the toasts and redirects. */
export function usePageActions(openId: string | null, onCreated: (parentId: string | null) => void) {
  const navigate = useNavigate()
  const pages = usePages()
  const create = useCreatePage()
  const update = useUpdatePage()
  const remove = useRemovePage()

  return {
    create: (draft: PageDraft, title: string) =>
      create.mutate(
        { kind: draft.kind, title, parentId: draft.parentId },
        {
          onSuccess: (page) => {
            onCreated(draft.parentId)
            // A new page opens ready to be written.
            if (page.kind === "page") void navigate({ to: "/pages/$pageId", params: { pageId: page.id }, search: { edit: true } })
          },
          onError,
        },
      ),
    rename: (id: string, title: string) => update.mutate({ id, input: { title } }, { onError }),
    move: (node: Page, parentId: string | null) =>
      update.mutate({ id: node.id, input: { parentId } }, { onSuccess: () => onCreated(parentId), onError }),
    remove: (node: Page) => {
      const gone = new Set([node.id, ...pageDescendants(pages.data ?? [], node.id).map((page) => page.id)])
      remove.mutate(node.id, {
        onSuccess: () => {
          if (openId && gone.has(openId)) void navigate({ to: "/pages" })
        },
        onError,
      })
    },
    download: async (node: Page) => {
      try {
        saveTextFile(downloadFileName(node.title), (await pagesService.content(node.id)).content)
      } catch (error) {
        onError(error)
      }
    },
  }
}
