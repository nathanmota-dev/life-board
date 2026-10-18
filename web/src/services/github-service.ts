import { api } from "@/services/api-client"
import type { ListResponse, OkResponse } from "@/types/api"
import type {
  Contributions,
  GithubConnectInput,
  GithubIssue,
  GithubIssueKind,
  GithubKind,
  GithubPr,
  GithubRepo,
  GithubStatus,
  GithubSyncResult,
} from "@/types/github"

export const githubService = {
  status: () => api.get<GithubStatus>("/github/status"),
  connect: (input: GithubConnectInput) => api.post<{ connected: true; login: string }>("/github/connect", input),
  disconnect: () => api.delete<OkResponse>("/github/disconnect"),
  sync: () => api.post<GithubSyncResult>("/github/sync"),
  prs: async (kind?: GithubKind) => (await api.get<ListResponse<GithubPr>>("/github/prs", { kind, limit: 200 })).items,
  issues: async (kind?: GithubIssueKind) =>
    (await api.get<ListResponse<GithubIssue>>("/github/issues", { kind, limit: 200 })).items,
  contributions: () => api.get<Contributions>("/github/contributions"),
  recentRepos: async () => (await api.get<ListResponse<GithubRepo>>("/github/repos/recent", { limit: 4 })).items,
}
