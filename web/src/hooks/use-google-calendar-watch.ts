import { useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { GOOGLE_CALENDAR_POLL_INTERVAL_MS } from "@/lib/google"
import { googleService } from "@/services/google-service"

/**
 * The Google status while the calendar is open. The API syncs in the background,
 * so it is checked every minute and, when `lastSyncAt` changes, the calendar
 * and stats queries reload to show what came in.
 */
export function useGoogleCalendarWatch() {
  const queryClient = useQueryClient()
  const status = useQuery({
    queryKey: [...queryKeys.google, "status"],
    queryFn: googleService.status,
    refetchInterval: GOOGLE_CALENDAR_POLL_INTERVAL_MS,
  })
  const lastSyncAt = status.data?.lastSyncAt
  const seen = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (!status.data) return
    if (seen.current !== undefined && seen.current !== lastSyncAt) {
      for (const queryKey of [queryKeys.calendar, queryKeys.stats, queryKeys.links]) {
        void queryClient.invalidateQueries({ queryKey })
      }
    }
    seen.current = lastSyncAt
  }, [status.data, lastSyncAt, queryClient])

  return status.data
}
