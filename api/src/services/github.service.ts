import { and, asc, desc, eq, notInArray, type SQL } from "drizzle-orm"
import type { Db } from "../db/client"
import {
  githubIssues,
  githubPrs,
  githubSettings,
  type GithubIssueKind,
  type GithubKind,
  type GithubSettings,
  type NewGithubIssue,
  type NewGithubPr,
} from "../db/schema"
import type { ConnectGithubBody, ListIssuesQuery, ListPrsQuery, RecentReposQuery } from "../dto/github.dto"
import type { CryptoService } from "./crypto.service"
import { BadRequestError, HttpError } from "./errors"
import { CONTRIBUTION_LEVELS, type GithubClient, type RawPull, type RawSearchItem, type RepoRef } from "./github-client.service"

const SETTINGS_ID = "default"
const MAX_SYNCED_PRS = 60
const MAX_SYNCED_ISSUES = 60

// When a PR matches several categories, keep the one most specific to the user.
const KIND_PRIORITY: Record<GithubKind, number> = {
  authored: 5,
  assigned: 4,
  review_requested: 3,
  mentioned: 2,
  in_my_repos: 1,
}

const SEARCHES: { kind: GithubKind; qualifier: string }[] = [
  { kind: "authored", qualifier: "author" },
  { kind: "review_requested", qualifier: "review-requested" },
  { kind: "mentioned", qualifier: "mentions" },
  { kind: "assigned", qualifier: "assignee" },
]

// `user:` matches issues in repos the user owns, like the PRs' "in my repos".
const ISSUE_SEARCHES: { kind: GithubIssueKind; qualifier: string }[] = [
  { kind: "authored", qualifier: "author" },
  { kind: "mentioned", qualifier: "mentions" },
  { kind: "assigned", qualifier: "assignee" },
  { kind: "in_my_repos", qualifier: "user" },
]

type Bucket = { kind: GithubKind; triggeredByLogin: string | null; item: RawSearchItem | RawPull; repo: RepoRef }

type IssueBucket = { kind: GithubIssueKind; item: RawSearchItem; repo: RepoRef }

type Logger = { warn: (message: string) => void }

export function repoFromUrl(url: string): RepoRef | null {
  const match = url.match(/\/repos\/([^/]+)\/([^/]+)/)
  return match ? { owner: match[1], name: match[2] } : null
}

function inOrg(repo: RepoRef, orgFilter: string | null) {
  return !orgFilter || repo.owner.toLowerCase() === orgFilter.toLowerCase()
}

function isRawPull(item: RawSearchItem | RawPull): item is RawPull {
  return Object.prototype.hasOwnProperty.call(item, "merged_at")
}

function addToBucket(buckets: Map<string, Bucket>, incoming: Bucket) {
  const key = `${incoming.repo.owner}/${incoming.repo.name}#${incoming.item.number}`
  const existing = buckets.get(key)
  if (!existing) return buckets.set(key, incoming)
  const winner = KIND_PRIORITY[incoming.kind] > KIND_PRIORITY[existing.kind] ? incoming : existing
  // Prefer the full pull payload over a search hit: it carries merged_at and diff stats.
  buckets.set(key, { ...winner, item: isRawPull(incoming.item) ? incoming.item : existing.item })
}

export class GithubService {
  constructor(
    private readonly db: Db,
    private readonly client: GithubClient,
    private readonly crypto: CryptoService,
    private readonly logger: Logger,
  ) {}

  async status() {
    const settings = await this.findSettings()
    return {
      connected: !!settings,
      login: settings?.login ?? null,
      lastSyncAt: settings?.lastSyncAt ?? null,
      lastSyncError: settings?.lastSyncError ?? null,
    }
  }

  async connect({ token, orgFilter = null }: ConnectGithubBody) {
    // Check the token before storing it, so a typo fails fast.
    let login: string
    try {
      login = await this.client.getLogin(token)
    } catch (error) {
      throw new BadRequestError("invalid_token", (error as Error).message)
    }

    const sealed = this.crypto.seal(token)
    const values = {
      login,
      orgFilter,
      tokenCiphertext: sealed.ciphertext,
      tokenIv: sealed.iv,
      tokenTag: sealed.tag,
      lastSyncError: null,
      updatedAt: new Date(),
    }
    await this.db
      .insert(githubSettings)
      .values({ id: SETTINGS_ID, ...values })
      .onConflictDoUpdate({ target: githubSettings.id, set: values })
    return { connected: true, login }
  }

  async disconnect() {
    await this.db.delete(githubSettings)
    await this.db.delete(githubPrs)
    await this.db.delete(githubIssues)
  }

  async sync() {
    const settings = await this.findSettings()
    if (!settings) throw new BadRequestError("not_connected", "GitHub is not connected.")

    try {
      const token = this.openToken(settings)
      const buckets = await this.collectPulls(token, settings.login, settings.orgFilter)
      const count = await this.store(token, buckets)
      const issues = await this.syncIssues(token, settings.login, settings.orgFilter)
      await this.db
        .update(githubSettings)
        .set({ lastSyncAt: new Date(), lastSyncError: null, updatedAt: new Date() })
        .where(eq(githubSettings.id, SETTINGS_ID))
      return { ok: true, count, issues, login: settings.login }
    } catch (error) {
      // Keep the reason so the UI can show why the last sync failed.
      const message = (error as Error).message
      await this.db
        .update(githubSettings)
        .set({ lastSyncError: message, updatedAt: new Date() })
        .where(eq(githubSettings.id, SETTINGS_ID))
      throw new HttpError(502, "sync_failed", message)
    }
  }

  /** Daily contribution counts for the connected account, with GitHub's 0-4 intensity level. */
  async contributions() {
    const settings = await this.findSettings()
    if (!settings) throw new BadRequestError("not_connected", "GitHub is not connected.")

    let calendar
    try {
      calendar = await this.client.getContributions(this.openToken(settings), settings.login)
    } catch (error) {
      throw new HttpError(502, "github_unavailable", (error as Error).message)
    }
    return {
      login: settings.login,
      total: calendar.totalContributions,
      days: calendar.weeks.flatMap((week) =>
        week.contributionDays.map((day) => ({
          date: day.date,
          count: day.contributionCount,
          level: Math.max(0, CONTRIBUTION_LEVELS.indexOf(day.contributionLevel)),
        })),
      ),
    }
  }

  /** Repos the connected account recently contributed to, for the dashboard. */
  async recentRepos({ limit }: RecentReposQuery) {
    const settings = await this.findSettings()
    if (!settings) throw new BadRequestError("not_connected", "GitHub is not connected.")

    let repos
    try {
      repos = await this.client.getContributedRepos(this.openToken(settings), settings.login, limit)
    } catch (error) {
      throw new HttpError(502, "github_unavailable", (error as Error).message)
    }
    return repos.map(({ repository: repo, lastContributedAt }) => ({
      fullName: repo.nameWithOwner,
      url: repo.url,
      description: repo.description,
      private: repo.isPrivate,
      lastContributedAt,
      stars: repo.stargazerCount,
      language: repo.primaryLanguage?.name ?? null,
      languageColor: repo.primaryLanguage?.color ?? null,
    }))
  }

  listPrs({ kind, limit }: ListPrsQuery) {
    const conditions: SQL[] = []
    if (kind) conditions.push(eq(githubPrs.kind, kind))
    return this.db
      .select()
      .from(githubPrs)
      .where(and(...conditions))
      .orderBy(desc(githubPrs.updatedAt), asc(githubPrs.id))
      .limit(limit)
  }

  listIssues({ kind, limit }: ListIssuesQuery) {
    const conditions: SQL[] = []
    if (kind) conditions.push(eq(githubIssues.kind, kind))
    return this.db
      .select()
      .from(githubIssues)
      .where(and(...conditions))
      .orderBy(desc(githubIssues.updatedAt), asc(githubIssues.id))
      .limit(limit)
  }

  private openToken(settings: GithubSettings) {
    return this.crypto.open({ ciphertext: settings.tokenCiphertext, iv: settings.tokenIv, tag: settings.tokenTag })
  }

  private async findSettings() {
    const [settings] = await this.db.select().from(githubSettings).where(eq(githubSettings.id, SETTINGS_ID))
    return settings
  }

  /** Union of open PRs that involve the user, keyed by `owner/repo#number`. */
  private async collectPulls(token: string, login: string, orgFilter: string | null) {
    const buckets = new Map<string, Bucket>()

    for (const { kind, qualifier } of SEARCHES) {
      try {
        const items = await this.client.searchIssues(token, `is:pr ${qualifier}:${login} is:open sort:updated-desc`)
        for (const item of items) {
          const repo = repoFromUrl(item.repository_url)
          if (repo) addToBucket(buckets, { kind, triggeredByLogin: item.user?.login ?? null, item, repo })
        }
      } catch (error) {
        // One failing category (bad query, secondary rate limit) shouldn't stop the sync.
        this.logger.warn(`[github] search failed (${kind}): ${(error as Error).message}`)
      }
    }

    // Open PRs in the 50 repos the user pushed to most recently.
    for (const repo of await this.client.listOwnedRepos(token, login, 50)) {
      try {
        for (const pull of await this.client.listOpenPulls(token, repo)) {
          addToBucket(buckets, { kind: "in_my_repos", triggeredByLogin: pull.user?.login ?? null, item: pull, repo })
        }
      } catch (error) {
        this.logger.warn(`[github] skipping ${repo.owner}/${repo.name}: ${(error as Error).message}`)
      }
    }

    for (const [key, bucket] of buckets) {
      if (!inOrg(bucket.repo, orgFilter)) buckets.delete(key)
    }
    return buckets
  }

  /** Upserts the most recently updated PRs and drops cached ones that no longer match. */
  private async store(token: string, buckets: Map<string, Bucket>) {
    const ranked = [...buckets.entries()]
      .sort(([, a], [, b]) => Date.parse(b.item.updated_at) - Date.parse(a.item.updated_at))
      .slice(0, MAX_SYNCED_PRS)

    // An empty result almost always means a token or permission problem;
    // keep the last known cache instead of wiping it.
    if (ranked.length === 0) return 0

    const rows: NewGithubPr[] = []
    for (const [id, bucket] of ranked) rows.push(await this.toRow(token, id, bucket))

    await this.db.transaction(async (tx) => {
      await tx.delete(githubPrs).where(notInArray(githubPrs.id, rows.map((row) => row.id)))
      for (const row of rows) {
        const { id, ...rest } = row
        await tx
          .insert(githubPrs)
          .values(row)
          .onConflictDoUpdate({ target: githubPrs.id, set: { ...rest, syncedAt: new Date() } })
      }
    })
    return rows.length
  }

  private async toRow(token: string, id: string, { item, kind, triggeredByLogin, repo }: Bucket): Promise<NewGithubPr> {
    let pull: RawPull | null = isRawPull(item) ? item : null
    if (!pull) {
      // Search hits don't carry branches or diff stats; fetch the PR once.
      try {
        pull = await this.client.getPull(token, repo, item.number)
      } catch {
        pull = null
      }
    }
    const mergedAt = pull ? pull.merged_at : (item as RawSearchItem).pull_request?.merged_at ?? null

    return {
      id,
      number: item.number,
      title: item.title,
      state: mergedAt ? "merged" : item.state,
      draft: item.draft ?? false,
      repoOwner: repo.owner,
      repoName: repo.name,
      authorLogin: item.user?.login ?? "",
      authorAvatarUrl: item.user?.avatar_url ?? null,
      url: item.html_url,
      baseBranch: pull?.base.ref ?? null,
      headBranch: pull?.head.ref ?? null,
      kind,
      triggeredByLogin,
      additions: pull?.additions ?? 0,
      deletions: pull?.deletions ?? 0,
      changedFiles: pull?.changed_files ?? 0,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
    }
  }

  /** Replaces the cached open issues that involve the user, unless every search failed. */
  private async syncIssues(token: string, login: string, orgFilter: string | null) {
    const buckets = new Map<string, IssueBucket>()
    let failures = 0

    for (const { kind, qualifier } of ISSUE_SEARCHES) {
      try {
        const items = await this.client.searchIssues(token, `is:issue ${qualifier}:${login} is:open sort:updated-desc`)
        for (const item of items) {
          const repo = repoFromUrl(item.repository_url)
          if (!repo || !inOrg(repo, orgFilter)) continue
          const key = `${repo.owner}/${repo.name}#${item.number}`
          const existing = buckets.get(key)
          if (!existing || KIND_PRIORITY[kind] > KIND_PRIORITY[existing.kind]) buckets.set(key, { kind, item, repo })
        }
      } catch (error) {
        failures++
        this.logger.warn(`[github] issue search failed (${kind}): ${(error as Error).message}`)
      }
    }
    // With no answer at all from GitHub, keep the last known cache.
    if (failures === ISSUE_SEARCHES.length) return 0

    const rows = [...buckets.entries()]
      .sort(([, a], [, b]) => Date.parse(b.item.updated_at) - Date.parse(a.item.updated_at))
      .slice(0, MAX_SYNCED_ISSUES)
      .map(([id, bucket]) => toIssueRow(id, bucket))

    await this.db.transaction(async (tx) => {
      await tx.delete(githubIssues).where(notInArray(githubIssues.id, rows.map((row) => row.id)))
      for (const row of rows) {
        const { id, ...rest } = row
        await tx
          .insert(githubIssues)
          .values(row)
          .onConflictDoUpdate({ target: githubIssues.id, set: { ...rest, syncedAt: new Date() } })
      }
    })
    return rows.length
  }
}

function toIssueRow(id: string, { item, kind, repo }: IssueBucket): NewGithubIssue {
  return {
    id,
    number: item.number,
    title: item.title,
    state: item.state,
    repoOwner: repo.owner,
    repoName: repo.name,
    authorLogin: item.user?.login ?? "",
    authorAvatarUrl: item.user?.avatar_url ?? null,
    url: item.html_url,
    kind,
    labels: (item.labels ?? []).map((label) => label.name),
    comments: item.comments ?? 0,
    createdAt: new Date(item.created_at),
    updatedAt: new Date(item.updated_at),
  }
}
