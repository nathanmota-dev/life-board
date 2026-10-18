import { describe, expect, it, vi } from "vitest"
import { GithubApiError, GithubClient } from "./github-client.service"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, statusText: status === 200 ? "OK" : "Unauthorized" })
}

describe("GithubClient", () => {
  it("sends the token and API headers", async () => {
    const fetchMock = vi.fn(async () => json({ login: "octocat" }))
    const client = new GithubClient(fetchMock)

    expect(await client.getLogin("ghp_token")).toBe("octocat")
    expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/user", {
      headers: expect.objectContaining({ Authorization: "Bearer ghp_token", Accept: "application/vnd.github+json" }),
    })
  })

  it("raises GithubApiError for failed requests and missing logins", async () => {
    await expect(new GithubClient(async () => json({ message: "Bad credentials" }, 401)).getLogin("x")).rejects.toThrow(
      /GitHub 401 Unauthorized: .*Bad credentials/,
    )
    await expect(new GithubClient(async () => json({})).getLogin("x")).rejects.toBeInstanceOf(GithubApiError)
  })

  it("encodes search queries", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request) => json({ items: [{ number: 1 }] }))
    const items = await new GithubClient(fetchMock).searchIssues("t", "is:pr author:me")

    expect(items).toEqual([{ number: 1 }])
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=is%3Apr%20author%3Ame&per_page=30")
  })

  it("pages through owned repos up to the limit", async () => {
    const page = (start: number, size: number) =>
      Array.from({ length: size }, (_, i) => ({ name: `repo-${start + i}`, owner: { login: "me" } }))
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      json(String(url).includes("page=1&") ? page(0, 50) : page(50, 10)),
    )
    const client = new GithubClient(fetchMock)

    expect(await client.listOwnedRepos("t", "me", 100)).toHaveLength(60)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await client.listOwnedRepos("t", "me", 20)).toHaveLength(20)
  })

  it("fetches pull lists and details for a repo", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => json(String(url).endsWith("/pulls/7") ? { number: 7 } : []))
    const client = new GithubClient(fetchMock)
    const repo = { owner: "me", name: "app" }

    expect(await client.listOpenPulls("t", repo)).toEqual([])
    expect(await client.getPull("t", repo, 7)).toEqual({ number: 7 })
  })

  it("posts the contributions query to GraphQL", async () => {
    const calendar = { totalContributions: 3, weeks: [] }
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      json({ data: { user: { contributionsCollection: { contributionCalendar: calendar } } } }),
    )

    expect(await new GithubClient(fetchMock).getContributions("t", "me")).toEqual(calendar)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("https://api.github.com/graphql")
    expect(init?.method).toBe("POST")
    expect(JSON.parse(String(init?.body)).variables).toEqual({ login: "me" })
  })

  it("raises when GraphQL returns no calendar", async () => {
    await expect(
      new GithubClient(async () => json({ errors: [{ message: "Could not resolve to a User" }] })).getContributions("t", "me"),
    ).rejects.toThrow("Could not resolve to a User")
    await expect(new GithubClient(async () => json({ data: { user: null } })).getContributions("t", "me")).rejects.toThrow(
      "GitHub returned no contributions.",
    )
  })

  it("ranks repositories by the user's own latest contribution", async () => {
    const repo = (name: string) => ({ nameWithOwner: name, url: `https://github.com/${name}`, description: null, isPrivate: false, stargazerCount: 0, primaryLanguage: null })
    const byRepo = (name: string, occurredAt?: string) => ({ repository: repo(name), contributions: { nodes: occurredAt ? [{ occurredAt }] : [] } })
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      json({
        data: {
          user: {
            contributionsCollection: {
              commitContributionsByRepository: [byRepo("me/old", "2026-01-01T00:00:00Z"), byRepo("org/busy", "2026-05-01T00:00:00Z")],
              pullRequestContributionsByRepository: [byRepo("org/busy", "2026-10-10T00:00:00Z"), byRepo("me/empty")],
              pullRequestReviewContributionsByRepository: [byRepo("org/reviewed", "2026-09-01T00:00:00Z")],
              issueContributionsByRepository: [byRepo("org/busy", "2026-02-01T00:00:00Z")],
            },
          },
        },
      }),
    )

    const repos = await new GithubClient(fetchMock).getContributedRepos("t", "me", 2)
    expect(repos.map((entry) => [entry.repository.nameWithOwner, entry.lastContributedAt])).toEqual([
      ["org/busy", "2026-10-10T00:00:00Z"],
      ["org/reviewed", "2026-09-01T00:00:00Z"],
    ])
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.variables).toEqual({ login: "me" })
    expect(body.query).toContain("commitContributionsByRepository(maxRepositories: 100)")
    expect(body.query).toContain("orderBy: { field: OCCURRED_AT, direction: DESC }")
  })

  it("raises when GraphQL returns no repositories", async () => {
    await expect(
      new GithubClient(async () => json({ errors: [{ message: "Bad query" }] })).getContributedRepos("t", "me", 4),
    ).rejects.toThrow("Bad query")
    await expect(new GithubClient(async () => json({ data: { user: null } })).getContributedRepos("t", "me", 4)).rejects.toThrow(
      "GitHub returned no repositories.",
    )
  })

  it("uses the global fetch by default", async () => {
    const original = globalThis.fetch
    globalThis.fetch = vi.fn(async () => json({ login: "global" }))
    try {
      expect(await new GithubClient().getLogin("t")).toBe("global")
    } finally {
      globalThis.fetch = original
    }
  })
})
