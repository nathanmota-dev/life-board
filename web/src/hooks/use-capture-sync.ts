import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { onCaptureSaved } from "@/lib/desktop-capture"

/** Refreshes the inbox lists when the global capture window saves something. */
export function useCaptureSync() {
  const queryClient = useQueryClient()

  useEffect(
    () =>
      onCaptureSaved(() => {
        for (const queryKey of [queryKeys.tasks, queryKeys.thoughts, queryKeys.stats, queryKeys.links]) {
          void queryClient.invalidateQueries({ queryKey })
        }
      }),
    [queryClient],
  )
}
