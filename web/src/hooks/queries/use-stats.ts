import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { statsService } from "@/services/stats-service"

export function useWeekStats() {
  return useQuery({ queryKey: [...queryKeys.stats, "week"], queryFn: statsService.thisWeek })
}
