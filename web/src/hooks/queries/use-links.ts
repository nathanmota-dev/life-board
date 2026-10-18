import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { linksService } from "@/services/links-service"
import type { BacklinkTarget, LinkIds } from "@/types/link"

export function useResolvedLinks(ids: LinkIds) {
  const hasIds = Object.values(ids).some((list) => list && list.length > 0)
  return useQuery({
    queryKey: [...queryKeys.links, "resolve", ids],
    queryFn: () => linksService.resolve(ids),
    enabled: hasIds,
  })
}

export function useBacklinks(target: BacklinkTarget) {
  return useQuery({
    queryKey: [...queryKeys.links, "backlinks", target],
    queryFn: () => linksService.backlinks(target),
  })
}
