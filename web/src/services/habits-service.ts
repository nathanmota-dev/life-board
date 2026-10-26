import { api } from "@/services/api-client"
import type { ListResponse, OkResponse } from "@/types/api"
import type { Habit, HabitInput, HabitLog, HabitLogEdit, HabitLogFilters, HabitLogInput } from "@/types/habit"

export const habitsService = {
  list: async () => (await api.get<ListResponse<Habit>>("/habits")).items,
  create: (input: HabitInput) => api.post<Habit>("/habits", input),
  update: (id: string, input: Partial<HabitInput>) => api.patch<Habit>(`/habits/${id}`, input),
  remove: (id: string) => api.delete<OkResponse>(`/habits/${id}`),
  log: (id: string, input: HabitLogInput) => api.post<HabitLog>(`/habits/${id}/logs`, input),
  setLog: ({ id, day, count }: HabitLogEdit) => api.put<HabitLog>(`/habits/${id}/logs/${day}`, { count }),
  logs: async (filters: HabitLogFilters) => (await api.get<ListResponse<HabitLog>>("/habits/logs", filters)).items,
}
