const GITHUB_API = "https://api.github.com"

type GithubUser = { login: string; avatar_url: string | null } | null

export type RawSearchItem = {
  number: number
  title: string
  state: "open" | "closed"
  draft?: boolean
  html_url: string
  user: GithubUser
  repository_url: string
  created_at: string
  updated_at: string
  pull_request?: { merged_at: string | null }
}

export type RawPull = {
  number: number
  title: string
  state: "open" | "closed"
  draft: boolean
  html_url: string
  user: GithubUser
  base: { ref: string }
  head: { ref: string }
  created_at: string
  updated_at: string
  merged_at: string | null
  additions?: number
  deletions?: number
  changed_files?: number
}

export type RepoRef = { owner: string; name: string }

export const CONTRIBUTION_LEVELS = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"] as const

export type RawContributionCalendar = {
  totalContributions: number
  weeks: { contributionDays: { date: string; contributionCount: number; contributionLevel: (typeof CONTRIBUTION_LEVELS)[number] }[] }[]
}

const CONTRIBUTIONS_QUERY = `query ($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`

export class GithubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Thin wrapper over the GitHub REST API; all HTTP lives here so it can be stubbed. */
export class GithubClient {
  constructor(private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)) {}

  async getLogin(token: string) {
    const me = await this.request<{ login?: string }>("/user", token)
    if (!me.login) throw new GithubApiError(200, "GitHub /user returned no login.")
    return me.login
  }

  async searchPulls(token: string, query: string) {
    const result = await this.request<{ items: RawSearchItem[] }>(
      `/search/issues?q=${encodeURIComponent(query)}&per_page=30`,
      token,
    )
    return result.items
  }

  /** Repos owned by `login`, most recently pushed first, capped at `max` (and 5 pages). */
  async listOwnedRepos(token: string, login: string, max: number) {
    const repos: RepoRef[] = []
    for (let page = 1; page <= 5 && repos.length < max; page++) {
      const batch = await this.request<{ name: string; owner: { login: string } }[]>(
        `/users/${login}/repos?per_page=50&page=${page}&sort=pushed&type=owner`,
        token,
      )
      for (const repo of batch) repos.push({ owner: repo.owner.login, name: repo.name })
      if (batch.length < 50) break
    }
    return repos.slice(0, max)
  }

  listOpenPulls(token: string, repo: RepoRef) {
    return this.request<RawPull[]>(
      `/repos/${repo.owner}/${repo.name}/pulls?state=open&per_page=50&sort=updated&direction=desc`,
      token,
    )
  }

  getPull(token: string, repo: RepoRef, number: number) {
    return this.request<RawPull>(`/repos/${repo.owner}/${repo.name}/pulls/${number}`, token)
  }

  /** The last year of the contributions graph shown on the user's GitHub profile. */
  async getContributions(token: string, login: string) {
    const result = await this.request<{
      data?: { user: { contributionsCollection: { contributionCalendar: RawContributionCalendar } } | null }
      errors?: { message: string }[]
    }>("/graphql", token, { method: "POST", body: JSON.stringify({ query: CONTRIBUTIONS_QUERY, variables: { login } }) })
    const calendar = result.data?.user?.contributionsCollection.contributionCalendar
    if (!calendar) throw new GithubApiError(200, result.errors?.[0]?.message ?? "GitHub returned no contributions.")
    return calendar
  }

  private async request<T>(path: string, token: string, init: { method?: string; body?: string } = {}): Promise<T> {
    const response = await this.fetchImpl(`${GITHUB_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "life-board",
      },
    })
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new GithubApiError(response.status, `GitHub ${response.status} ${response.statusText}: ${body.slice(0, 200)}`)
    }
    return (await response.json()) as T
  }
}
