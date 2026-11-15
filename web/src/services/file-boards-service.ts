import { api, ApiError, buildApiUrl } from "@/services/api-client"
import type { ListResponse, OkResponse } from "@/types/api"
import type { FileBoard, FileBoardInput, FileItem, FileItemUpdate, FileUploadInput } from "@/types/file-board"

export const fileBoardsService = {
  list: async () => (await api.get<ListResponse<FileBoard>>("/file-boards")).items,
  create: (input: FileBoardInput) => api.post<FileBoard>("/file-boards", input),
  update: (id: string, input: Partial<FileBoardInput>) => api.patch<FileBoard>(`/file-boards/${id}`, input),
  remove: (id: string) => api.delete<OkResponse>(`/file-boards/${id}`),
  items: async (boardId: string) => (await api.get<ListResponse<FileItem>>(`/file-boards/${boardId}/items`)).items,
  upload: ({ boardId, file, title, kind }: FileUploadInput) => {
    const form = new FormData()
    if (title) form.append("title", title)
    if (kind) form.append("kind", kind)
    // Fields first: the API reads metadata that arrives before the file part.
    form.append("file", file)
    return api.post<FileItem>(`/file-boards/${boardId}/items`, form)
  },
  updateItem: (id: string, input: FileItemUpdate) => api.patch<FileItem>(`/file-items/${id}`, input),
  removeItem: (id: string) => api.delete<OkResponse>(`/file-items/${id}`),
  /** `version` (the item's `updatedAt`) changes the URL after an edit, so a cached copy isn't reused. */
  fileUrl: (id: string, version?: string) => buildApiUrl(`/file-items/${id}/file`, { v: version }),
  fileText: async (id: string, version?: string) => {
    const response = await fetch(await buildApiUrl(`/file-items/${id}/file`, { v: version }), { credentials: "include" })
    if (!response.ok) throw new ApiError(response.status, "request_failed", response.statusText)
    return response.text()
  },
  saveText: (id: string, content: string) => api.put<FileItem>(`/file-items/${id}/file`, { content }),
}
