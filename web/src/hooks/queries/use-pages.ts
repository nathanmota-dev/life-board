import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { pagesService } from "@/services/pages-service"
import type { Page, PageInput, PageUpdate } from "@/types/page"

const treeKey = [...queryKeys.pages, "tree"]
const contentKey = (id: string) => [...queryKeys.pages, "content", id]

export function usePages() {
  return useQuery({ queryKey: treeKey, queryFn: pagesService.list })
}

/** A page's text is its own query, so saving it doesn't refetch the tree. */
export function usePageContent(id: string | null) {
  return useQuery({
    queryKey: contentKey(id ?? ""),
    queryFn: () => pagesService.content(id!),
    enabled: id !== null,
  })
}

/** After a content save: the tree gets the new size and date, and the text is already known. */
export function applySavedPageContent(queryClient: QueryClient, page: Page, content: string) {
  queryClient.setQueryData<Page[]>(treeKey, (pages) => pages?.map((current) => (current.id === page.id ? page : current)))
  queryClient.setQueryData(contentKey(page.id), { content, updatedAt: page.updatedAt })
}

export function useCreatePage() {
  return useInvalidatingMutation((input: PageInput) => pagesService.create(input), [queryKeys.pages])
}

export function useUpdatePage() {
  return useInvalidatingMutation(
    ({ id, input }: { id: string; input: PageUpdate }) => pagesService.update(id, input),
    [queryKeys.pages],
  )
}

export function useRemovePage() {
  const queryClient = useQueryClient()
  const mutation = useInvalidatingMutation(async (id: string) => {
    const result = await pagesService.remove(id)
    queryClient.removeQueries({ queryKey: contentKey(id) })
    return result
  }, [queryKeys.pages])
  return mutation
}
