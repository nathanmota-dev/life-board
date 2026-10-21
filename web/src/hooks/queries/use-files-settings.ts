import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { settingsService } from "@/services/settings-service"

export function useFilesSettings() {
  return useQuery({ queryKey: [...queryKeys.settings, "files"], queryFn: settingsService.files })
}

export function useUpdateFilesSettings() {
  return useInvalidatingMutation(settingsService.updateFiles, [queryKeys.settings, queryKeys.fileBoards])
}
