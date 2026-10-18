import { api } from "@/services/api-client"
import type { ListResponse, OkResponse } from "@/types/api"
import type { MoodEntry, MoodInput, MoodToday } from "@/types/mood"

export const moodService = {
  today: () => api.get<MoodToday>("/mood/today"),
  list: async (limit = 90) => (await api.get<ListResponse<MoodEntry>>("/mood/entries", { limit })).items,
  save: (input: MoodInput) => api.post<MoodEntry>("/mood/entries", input),
  remove: (id: string) => api.delete<OkResponse>(`/mood/entries/${id}`),
}
