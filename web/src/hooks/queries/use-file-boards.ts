import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { fileBoardsService } from "@/services/file-boards-service"
import type { FileItemUpdate } from "@/types/file-board"

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

export function useFileUrl(itemId: string) {
  return useQuery({ queryKey: [...queryKeys.fileBoards, "url", itemId], queryFn: () => fileBoardsService.fileUrl(itemId) })
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
