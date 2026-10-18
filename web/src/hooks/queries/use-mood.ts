import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { moodService } from "@/services/mood-service"

export function useMoodToday() {
  return useQuery({ queryKey: [...queryKeys.mood, "today"], queryFn: moodService.today })
}

export function useMoodEntries(limit = 90) {
  return useQuery({ queryKey: [...queryKeys.mood, "entries", limit], queryFn: () => moodService.list(limit) })
}

export function useSaveMood() {
  return useInvalidatingMutation(moodService.save, [queryKeys.mood])
}

export function useRemoveMood() {
  return useInvalidatingMutation(moodService.remove, [queryKeys.mood])
}
