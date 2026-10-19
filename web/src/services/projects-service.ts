import { api } from "@/services/api-client"
import type { ListResponse, OkResponse } from "@/types/api"
import type { Project, ProjectInput, ProjectMoveInput, ProjectStatusChange } from "@/types/project"

export const projectsService = {
  list: async () => (await api.get<ListResponse<Project>>("/projects")).items,
  listArchived: async () => (await api.get<ListResponse<Project>>("/projects", { archived: true })).items,
  history: async (id: string) => (await api.get<ListResponse<ProjectStatusChange>>(`/projects/${id}/history`)).items,
  create: (input: ProjectInput) => api.post<Project>("/projects", input),
  update: (id: string, input: ProjectInput) => api.patch<Project>(`/projects/${id}`, input),
  move: async (id: string, input: ProjectMoveInput) => (await api.patch<ListResponse<Project>>(`/projects/${id}/move`, input)).items,
  archive: (id: string) => api.post<Project>(`/projects/${id}/archive`),
  restore: (id: string) => api.post<Project>(`/projects/${id}/restore`),
  remove: (id: string) => api.delete<OkResponse>(`/projects/${id}`),
}
