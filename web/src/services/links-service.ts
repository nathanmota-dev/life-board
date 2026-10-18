import { api } from "@/services/api-client"
import type { Backlink, BacklinkTarget, LinkIds, ResolvedLink } from "@/types/link"

export const linksService = {
  resolve: async (ids: LinkIds) => (await api.post<{ links: ResolvedLink[] }>("/links/resolve", ids)).links,
  backlinks: async ({ kind, id }: BacklinkTarget) =>
    (await api.get<{ backlinks: Backlink[] }>(`/links/backlinks/${kind}/${id}`)).backlinks,
}
