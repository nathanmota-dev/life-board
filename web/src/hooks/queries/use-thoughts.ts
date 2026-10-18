import { useInfiniteQuery } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { thoughtsService } from "@/services/thoughts-service"
import type { ThoughtFilters, ThoughtInput } from "@/types/thought"

export function useThoughts(filters: ThoughtFilters = {}) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.thoughts, filters],
    queryFn: ({ pageParam }) => thoughtsService.list(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    select: (data) => data.pages.flatMap((page) => page.items),
  })
}

export function useCreateThought() {
  return useInvalidatingMutation(thoughtsService.create, [queryKeys.thoughts])
}

export function useUpdateThought() {
  return useInvalidatingMutation(
    ({ id, input }: { id: string; input: ThoughtInput }) => thoughtsService.update(id, input),
    [queryKeys.thoughts],
  )
}

export function useRemoveThought() {
  return useInvalidatingMutation(thoughtsService.remove, [queryKeys.thoughts])
}
