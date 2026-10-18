import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { githubPrs, githubSettings } from "../db/schema"
import { createTestDb } from "../test/create-test-app"
import { CryptoService } from "./crypto.service"
import { BadRequestError, HttpError } from "./errors"
import type { GithubClient, RawPull, RawSearchItem } from "./github-client.service"
import { GithubService, repoFromUrl } from "./github.service"

let ctx: Awaited<ReturnType<typeof createTestDb>>
const crypto = new CryptoService(Buffer.alloc(32, 3))
const logger = { warn: vi.fn() }

beforeEach(async () => {
  ctx = await createTestDb()
  logger.warn.mockClear()
})
afterEach(() => ctx.cleanup())

function searchItem(owner: string, number: number, updatedAt: string, extra: Partial<RawSearchItem> = {}): RawSearchItem {
  return {
    number,
    title: `PR ${number}`,
    state: "open",
    html_url: `https://github.com/${owner}/app/pull/${number}`,
    user: { login: "author", avatar_url: "https://avatar" },
    repository_url: `https://api.github.com/repos/${owner}/app`,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: updatedAt,
    ...extra,
  }
}

function pull(number: number, extra: Partial<RawPull> = {}): RawPull {
  return {
    number,
    title: `PR ${number}`,
    state: "open",
    draft: false,
    html_url: `https://github.com/me/app/pull/${number}`,
    user: { login: "friend", avatar_url: null },
    base: { ref: "main" },
    head: { ref: `feature-${number}` },
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-10T00:00:00Z",
    merged_at: null,
    additions: 10,
    deletions: 2,
    changed_files: 3,
    ...extra,
  }
}

function fakeClient(overrides: Partial<Record<keyof GithubClient, unknown>> = {}) {
  return {
    getLogin: vi.fn(async () => "me"),
    searchPulls: vi.fn(async () => []),
    listOwnedRepos: vi.fn(async () => []),
    listOpenPulls: vi.fn(async () => []),
    getPull: vi.fn(async (_token: string, _repo: unknown, number: number) => pull(number)),
    getContributions: vi.fn(async () => ({
      totalContributions: 5,
      weeks: [
        {
          contributionDays: [
            { date: "2026-10-11", contributionCount: 0, contributionLevel: "NONE" },
            { date: "2026-10-12", contributionCount: 5, contributionLevel: "FOURTH_QUARTILE" },
          ],
        },
      ],
    })),
    ...overrides,
  } as unknown as GithubClient
}

async function connected(client: GithubClient, orgFilter?: string) {
  const service = new GithubService(ctx.db, client, crypto, logger)
  await service.connect({ token: "ghp_0123456789abcdefghij", orgFilter })
  return service
}

describe("repoFromUrl", () => {
  it("parses API repo URLs", () => {
    expect(repoFromUrl("https://api.github.com/repos/me/app")).toEqual({ owner: "me", name: "app" })
    expect(repoFromUrl("https://example.com")).toBeNull()
  })
})

describe("GithubService", () => {
  it("connects with an encrypted token and reports status", async () => {
    const service = new GithubService(ctx.db, fakeClient(), crypto, logger)
    expect(await service.status()).toEqual({ connected: false, login: null, lastSyncAt: null, lastSyncError: null })

    expect(await service.connect({ token: "ghp_0123456789abcdefghij" })).toEqual({ connected: true, login: "me" })
    // Reconnecting replaces the single settings row.
    await service.connect({ token: "ghp_0123456789abcdefghij", orgFilter: "acme" })

    const rows = await ctx.db.select().from(githubSettings)
    expect(rows).toHaveLength(1)
    expect(rows[0].tokenCiphertext).not.toContain("ghp_")
    expect(rows[0].orgFilter).toBe("acme")
    expect(await service.status()).toMatchObject({ connected: true, login: "me" })
  })

  it("rejects tokens GitHub doesn't accept", async () => {
    const client = fakeClient({ getLogin: vi.fn(async () => Promise.reject(new Error("Bad credentials"))) })
    await expect(new GithubService(ctx.db, client, crypto, logger).connect({ token: "x".repeat(20) })).rejects.toMatchObject({
      code: "invalid_token",
    })
  })

  it("requires a connection before syncing", async () => {
    await expect(new GithubService(ctx.db, fakeClient(), crypto, logger).sync()).rejects.toBeInstanceOf(BadRequestError)
  })

  it("syncs PRs, keeping the strongest kind and the richest payload", async () => {
    const client = fakeClient({
      searchPulls: vi.fn(async (_token: string, query: string) => {
        if (query.includes("author:me")) return [searchItem("me", 1, "2026-10-12T00:00:00Z", { pull_request: { merged_at: "2026-10-12T00:00:00Z" } })]
        if (query.includes("mentions:me")) return [searchItem("me", 1, "2026-10-12T00:00:00Z"), searchItem("other", 5, "2026-10-11T00:00:00Z", { draft: true, user: null })]
        if (query.includes("assignee:me")) throw new Error("rate limited")
        return [searchItem("x", 9, "2026-10-01T00:00:00Z", { repository_url: "not-a-repo" })]
      }),
      listOwnedRepos: vi.fn(async () => [
        { owner: "me", name: "app" },
        { owner: "me", name: "private" },
      ]),
      listOpenPulls: vi.fn(async (_token: string, repo: { name: string }) => {
        if (repo.name === "private") throw new Error("404")
        return [pull(1), pull(2, { updated_at: "2026-10-09T00:00:00Z" })]
      }),
      getPull: vi.fn(async () => Promise.reject(new Error("gone"))),
    })
    const service = await connected(client)

    expect(await service.sync()).toEqual({ ok: true, count: 3, login: "me" })

    const prs = await service.listPrs({ limit: 10 })
    expect(prs.map((pr) => [pr.id, pr.kind])).toEqual([
      ["other/app#5", "mentioned"],
      ["me/app#1", "authored"],
      ["me/app#2", "in_my_repos"],
    ])
    // PR #1 kept "authored" but took branches and diff stats from the full pull payload.
    expect(prs[1]).toMatchObject({ headBranch: "feature-1", additions: 10, state: "open" })
    // Search-only PR whose detail fetch failed: no branches, defaults for stats.
    expect(prs[0]).toMatchObject({ draft: true, authorLogin: "", headBranch: null, additions: 0 })
    expect(await service.listPrs({ kind: "authored", limit: 10 })).toHaveLength(1)
    expect(logger.warn).toHaveBeenCalledTimes(2)
    expect((await service.status()).lastSyncAt).toBeInstanceOf(Date)
  })

  it("marks merged search hits and fills details from the PR endpoint", async () => {
    const client = fakeClient({
      searchPulls: vi.fn(async (_token: string, query: string) =>
        query.includes("author:me") ? [searchItem("me", 3, "2026-10-12T00:00:00Z")] : [],
      ),
      getPull: vi.fn(async () => pull(3, { merged_at: "2026-10-12T00:00:00Z", additions: undefined, deletions: undefined, changed_files: undefined })),
    })
    const service = await connected(client)
    await service.sync()

    expect((await service.listPrs({ limit: 10 }))[0]).toMatchObject({ state: "merged", baseBranch: "main", additions: 0 })
  })

  it("drops stale PRs, applies the org filter and keeps the cache on empty results", async () => {
    let results = [searchItem("acme", 1, "2026-10-12T00:00:00Z"), searchItem("me", 2, "2026-10-12T00:00:00Z")]
    const client = fakeClient({
      searchPulls: vi.fn(async (_token: string, query: string) => (query.includes("author:me") ? results : [])),
    })
    const service = await connected(client, "ACME")
    await ctx.db.insert(githubPrs).values({
      id: "acme/old#99",
      number: 99,
      title: "Stale",
      state: "open",
      repoOwner: "acme",
      repoName: "old",
      authorLogin: "me",
      url: "u",
      kind: "authored",
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await service.sync()
    expect((await service.listPrs({ limit: 10 })).map((pr) => pr.id)).toEqual(["acme/app#1"])

    results = []
    expect((await service.sync()).count).toBe(0)
    expect(await service.listPrs({ limit: 10 })).toHaveLength(1)
  })

  it("records the error when a sync fails", async () => {
    const client = fakeClient({ listOwnedRepos: vi.fn(async () => Promise.reject(new Error("GitHub 401"))) })
    const service = await connected(client)

    await expect(service.sync()).rejects.toMatchObject({ statusCode: 502, code: "sync_failed" })
    await expect(service.sync()).rejects.toBeInstanceOf(HttpError)
    expect((await service.status()).lastSyncError).toBe("GitHub 401")
  })

  it("returns the contributions calendar with numeric levels", async () => {
    const client = fakeClient()
    await expect(new GithubService(ctx.db, client, crypto, logger).contributions()).rejects.toMatchObject({ code: "not_connected" })

    const service = await connected(client)
    expect(await service.contributions()).toEqual({
      login: "me",
      total: 5,
      days: [
        { date: "2026-10-11", count: 0, level: 0 },
        { date: "2026-10-12", count: 5, level: 4 },
      ],
    })
    expect(client.getContributions).toHaveBeenCalledWith("ghp_0123456789abcdefghij", "me")
  })

  it("reports GitHub failures when loading contributions", async () => {
    const service = await connected(fakeClient({ getContributions: vi.fn(async () => Promise.reject(new Error("GitHub 502"))) }))
    await expect(service.contributions()).rejects.toMatchObject({ statusCode: 502, code: "github_unavailable" })
  })

  it("disconnects and clears the cache", async () => {
    const client = fakeClient({ searchPulls: vi.fn(async () => [searchItem("me", 1, "2026-10-12T00:00:00Z")]) })
    const service = await connected(client)
    await service.sync()

    await service.disconnect()

    expect((await service.status()).connected).toBe(false)
    expect(await service.listPrs({ limit: 10 })).toEqual([])
  })
})
