import { api } from "@/services/api-client"
import type { ListResponse, OkResponse } from "@/types/api"
import type { Project, ProjectInput } from "@/types/project"

export const projectsService = {
  list: async () => (await api.get<ListResponse<Project>>("/projects")).items,
  create: (input: ProjectInput) => api.post<Project>("/projects", input),
  update: (id: string, input: ProjectInput) => api.patch<Project>(`/projects/${id}`, input),
  reorder: async (ids: string[]) => (await api.put<ListResponse<Project>>("/projects/order", { ids })).items,
  remove: (id: string) => api.delete<OkResponse>(`/projects/${id}`),
}
