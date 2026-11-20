import { api } from "@/services/api-client"
import type { ListResponse, OkResponse } from "@/types/api"
import type { Page, PageContent, PageImportInput, PageInput, PageUpdate } from "@/types/page"

export const pagesService = {
  list: async () => (await api.get<ListResponse<Page>>("/pages")).items,
  create: (input: PageInput) => api.post<Page>("/pages", input),
  update: (id: string, input: PageUpdate) => api.patch<Page>(`/pages/${id}`, input),
  remove: (id: string) => api.delete<OkResponse>(`/pages/${id}`),
  content: (id: string) => api.get<PageContent>(`/pages/${id}/content`),
  saveContent: (id: string, content: string) => api.put<Page>(`/pages/${id}/content`, { content }),
  importFile: ({ file, parentId, folderPath }: PageImportInput) => {
    const form = new FormData()
    if (parentId) form.append("parentId", parentId)
    if (folderPath) form.append("folderPath", folderPath)
    // Fields first: the API reads metadata that arrives before the file part.
    form.append("file", file)
    return api.post<Page>("/pages/import", form)
  },
}
