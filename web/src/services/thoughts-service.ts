import { api } from "@/services/api-client"
import type { OkResponse } from "@/types/api"
import type { Thought, ThoughtFilters, ThoughtInput, ThoughtPage } from "@/types/thought"

export const thoughtsService = {
  list: (filters: ThoughtFilters = {}, cursor?: string | null) =>
    api.get<ThoughtPage>("/thoughts", { ...filters, cursor }),
  create: (input: ThoughtInput) => api.post<Thought>("/thoughts", input),
  update: (id: string, input: ThoughtInput) => api.patch<Thought>(`/thoughts/${id}`, input),
  remove: (id: string) => api.delete<OkResponse>(`/thoughts/${id}`),
}
