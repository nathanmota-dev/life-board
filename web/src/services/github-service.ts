import { api } from "@/services/api-client"
import type { ListResponse, OkResponse } from "@/types/api"
import type { Contributions, GithubConnectInput, GithubKind, GithubPr, GithubStatus, GithubSyncResult } from "@/types/github"

export const githubService = {
  status: () => api.get<GithubStatus>("/github/status"),
  connect: (input: GithubConnectInput) => api.post<{ connected: true; login: string }>("/github/connect", input),
  disconnect: () => api.delete<OkResponse>("/github/disconnect"),
  sync: () => api.post<GithubSyncResult>("/github/sync"),
  prs: async (kind?: GithubKind) => (await api.get<ListResponse<GithubPr>>("/github/prs", { kind, limit: 200 })).items,
  contributions: () => api.get<Contributions>("/github/contributions"),
}
