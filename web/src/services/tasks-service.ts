import { api } from "@/services/api-client"
import type { ListResponse, OkResponse } from "@/types/api"
import type { Task, TaskFilters, TaskInput, TaskUpdate } from "@/types/task"

export const tasksService = {
  list: async (filters: TaskFilters = {}) => (await api.get<ListResponse<Task>>("/tasks", filters)).items,
  get: (id: string) => api.get<Task>(`/tasks/${id}`),
  create: (input: TaskInput) => api.post<Task>("/tasks", input),
  update: (id: string, input: TaskUpdate) => api.patch<Task>(`/tasks/${id}`, input),
  remove: (id: string) => api.delete<OkResponse>(`/tasks/${id}`),
}
