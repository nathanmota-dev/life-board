import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GithubClient } from "../services/github-client.service"
import { createTestApp } from "../test/create-test-app"

let ctx: Awaited<ReturnType<typeof createTestApp>>
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(async () => {
  fetchMock = vi.fn<typeof fetch>(async (url) => {
    const path = String(url)
    if (path.endsWith("/user")) return json({ login: "me" })
    if (path.endsWith("/graphql")) {
      return json({ data: { user: { contributionsCollection: { contributionCalendar: { totalContributions: 0, weeks: [] } } } } })
    }
    if (path.includes("/search/issues") && path.includes("is%3Aissue%20author")) {
      return json({
        items: [
          {
            number: 7,
            title: "Broken",
            state: "open",
            html_url: "https://github.com/me/app/issues/7",
            user: { login: "me", avatar_url: null },
            repository_url: "https://api.github.com/repos/me/app",
            created_at: "2026-10-01T00:00:00Z",
            updated_at: "2026-10-03T00:00:00Z",
            labels: [{ name: "bug" }],
            comments: 2,
          },
        ],
      })
    }
    if (path.includes("/search/issues")) return json({ items: [] })
    if (path.includes("/repos?")) return json([{ name: "app", owner: { login: "me" } }])
    return json([
      {
        number: 1,
        title: "Fix",
        state: "open",
        draft: false,
        html_url: "https://github.com/me/app/pull/1",
        user: { login: "friend", avatar_url: null },
        base: { ref: "main" },
        head: { ref: "fix" },
        created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-02T00:00:00Z",
        merged_at: null,
      },
    ])
  })
  ctx = await createTestApp({ githubClient: new GithubClient(fetchMock) })
})
afterEach(() => ctx.cleanup())

describe("github controller", () => {
  it("connects, syncs, lists and disconnects", async () => {
    const connect = await ctx.app.inject({ method: "POST", url: "/api/github/connect", payload: { token: "ghp_0123456789abcdefghij" } })
    expect(connect.json()).toEqual({ connected: true, login: "me" })

    expect((await ctx.app.inject({ method: "POST", url: "/api/github/sync" })).json()).toEqual({ ok: true, count: 1, issues: 1, login: "me" })

    const prs = await ctx.app.inject({ method: "GET", url: "/api/github/prs?kind=in_my_repos" })
    expect(prs.json().items).toEqual([expect.objectContaining({ id: "me/app#1", headBranch: "fix" })])

    const issues = await ctx.app.inject({ method: "GET", url: "/api/github/issues?kind=authored" })
    expect(issues.json().items).toEqual([expect.objectContaining({ id: "me/app#7", labels: ["bug"], comments: 2 })])
    expect((await ctx.app.inject({ method: "GET", url: "/api/github/issues?kind=review_requested" })).statusCode).toBe(400)

    expect((await ctx.app.inject({ method: "GET", url: "/api/github/contributions" })).json()).toEqual({ login: "me", total: 0, days: [] })
    expect((await ctx.app.inject({ method: "GET", url: "/api/github/status" })).json().connected).toBe(true)
    expect((await ctx.app.inject({ method: "DELETE", url: "/api/github/disconnect" })).json()).toEqual({ ok: true })
    expect((await ctx.app.inject({ method: "GET", url: "/api/github/status" })).json().connected).toBe(false)
  })

  it("maps failures to HTTP errors", async () => {
    expect((await ctx.app.inject({ method: "POST", url: "/api/github/sync" })).json().error).toBe("not_connected")
    expect((await ctx.app.inject({ method: "POST", url: "/api/github/connect", payload: { token: "short" } })).statusCode).toBe(400)

    fetchMock.mockResolvedValueOnce(json({ message: "Bad credentials" }, 401))
    const invalid = await ctx.app.inject({ method: "POST", url: "/api/github/connect", payload: { token: "ghp_0123456789abcdefghij" } })
    expect(invalid.json().error).toBe("invalid_token")

    await ctx.app.inject({ method: "POST", url: "/api/github/connect", payload: { token: "ghp_0123456789abcdefghij" } })
    fetchMock.mockImplementation(async () => json({}, 500))
    const failed = await ctx.app.inject({ method: "POST", url: "/api/github/sync" })
    expect(failed.statusCode).toBe(502)
    expect(failed.json().error).toBe("sync_failed")
  })
})
