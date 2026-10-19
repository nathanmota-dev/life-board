import { api } from "@/services/api-client"
import type { ListResponse, OkResponse } from "@/types/api"
import type { BoardTask, Task, TaskFilters, TaskInput, TaskOrderItem, TaskUpdate } from "@/types/task"

export const tasksService = {
  list: async (filters: TaskFilters = {}) => (await api.get<ListResponse<Task>>("/tasks", filters)).items,
  board: async (filters: Omit<TaskFilters, "include"> = {}) =>
    (await api.get<ListResponse<BoardTask>>("/tasks", { ...filters, include: "children" })).items,
  get: (id: string) => api.get<Task>(`/tasks/${id}`),
  create: (input: TaskInput) => api.post<Task>("/tasks", input),
  update: (id: string, input: TaskUpdate) => api.patch<Task>(`/tasks/${id}`, input),
  reorder: (items: TaskOrderItem[]) => api.patch<OkResponse>("/tasks/order", items),
  remove: (id: string) => api.delete<OkResponse>(`/tasks/${id}`),
  restore: (id: string) => api.post<Task>(`/tasks/${id}/restore`),
}
