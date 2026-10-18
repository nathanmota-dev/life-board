import { useMutation, useQueryClient } from "@tanstack/react-query"
import { queryKeys, type QueryRoot } from "@/hooks/queries/query-keys"

/** A mutation that refreshes the given modules (and the weekly stats) once it succeeds. */
export function useInvalidatingMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  roots: QueryRoot[],
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all(
        [...roots, queryKeys.stats, queryKeys.links].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  })
}
