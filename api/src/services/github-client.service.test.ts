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
    const items = await new GithubClient(fetchMock).searchPulls("t", "is:pr author:me")

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
