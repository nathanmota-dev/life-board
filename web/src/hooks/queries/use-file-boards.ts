import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { fileBoardsService } from "@/services/file-boards-service"
import type { FileItem, FileItemUpdate } from "@/types/file-board"

export function useFileBoards() {
  return useQuery({ queryKey: [...queryKeys.fileBoards, "list"], queryFn: fileBoardsService.list })
}

export function useFileItems(boardId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.fileBoards, "items", boardId],
    queryFn: () => fileBoardsService.items(boardId!),
    enabled: boardId !== null,
  })
}

export function useFileUrl(item: FileItem) {
  return useQuery({
    queryKey: [...queryKeys.fileBoards, "url", item.id, item.updatedAt],
    queryFn: () => fileBoardsService.fileUrl(item.id, item.updatedAt),
  })
}

export function useFileText(item: FileItem, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.fileBoards, "text", item.id, item.updatedAt],
    queryFn: () => fileBoardsService.fileText(item.id, item.updatedAt),
    enabled,
    placeholderData: keepPreviousData,
  })
}

/** After a text save: the board list gets the new size and version, and that version's text is already known. */
export function applySavedText(queryClient: QueryClient, item: FileItem, content: string) {
  queryClient.setQueryData<FileItem[]>([...queryKeys.fileBoards, "items", item.boardId], (items) =>
    items?.map((current) => (current.id === item.id ? item : current)),
  )
  queryClient.setQueryData([...queryKeys.fileBoards, "text", item.id, item.updatedAt], content)
}

export function useCreateBoard() {
  return useInvalidatingMutation(fileBoardsService.create, [queryKeys.fileBoards])
}

export function useRemoveBoard() {
  return useInvalidatingMutation(fileBoardsService.remove, [queryKeys.fileBoards])
}

export function useUploadFile() {
  return useInvalidatingMutation(fileBoardsService.upload, [queryKeys.fileBoards])
}

export function useUpdateFileItem() {
  return useInvalidatingMutation(
    ({ id, input }: { id: string; input: FileItemUpdate }) => fileBoardsService.updateItem(id, input),
    [queryKeys.fileBoards],
  )
}

export function useRemoveFileItem() {
  return useInvalidatingMutation(fileBoardsService.removeItem, [queryKeys.fileBoards])
}
