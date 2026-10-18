import { api, buildApiUrl } from "@/services/api-client"
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
  fileUrl: (id: string) => buildApiUrl(`/file-items/${id}/file`),
}
