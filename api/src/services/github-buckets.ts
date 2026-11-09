import type { GithubIssueKind, GithubKind, NewGithubIssue } from "../db/schema"
import type { RawPull, RawSearchItem, RepoRef } from "./github-client.service"

// When a PR matches several categories, keep the one most specific to the user.
export const KIND_PRIORITY: Record<GithubKind, number> = {
  authored: 5,
  assigned: 4,
  review_requested: 3,
  mentioned: 2,
  in_my_repos: 1,
}

export const SEARCHES: { kind: GithubKind; qualifier: string }[] = [
  { kind: "authored", qualifier: "author" },
  { kind: "review_requested", qualifier: "review-requested" },
  { kind: "mentioned", qualifier: "mentions" },
  { kind: "assigned", qualifier: "assignee" },
]

// `user:` matches issues in repos the user owns, like the PRs' "in my repos".
export const ISSUE_SEARCHES: { kind: GithubIssueKind; qualifier: string }[] = [
  { kind: "authored", qualifier: "author" },
  { kind: "mentioned", qualifier: "mentions" },
  { kind: "assigned", qualifier: "assignee" },
  { kind: "in_my_repos", qualifier: "user" },
]

export type Bucket = { kind: GithubKind; triggeredByLogin: string | null; item: RawSearchItem | RawPull; repo: RepoRef }

export type IssueBucket = { kind: GithubIssueKind; item: RawSearchItem; repo: RepoRef }

export function repoFromUrl(url: string): RepoRef | null {
  const match = url.match(/\/repos\/([^/]+)\/([^/]+)/)
  return match ? { owner: match[1], name: match[2] } : null
}

export function inOrg(repo: RepoRef, orgFilter: string | null) {
  return !orgFilter || repo.owner.toLowerCase() === orgFilter.toLowerCase()
}

export function isRawPull(item: RawSearchItem | RawPull): item is RawPull {
  return Object.prototype.hasOwnProperty.call(item, "merged_at")
}

export function addToBucket(buckets: Map<string, Bucket>, incoming: Bucket) {
  const key = `${incoming.repo.owner}/${incoming.repo.name}#${incoming.item.number}`
  const existing = buckets.get(key)
  if (!existing) return buckets.set(key, incoming)
  const winner = KIND_PRIORITY[incoming.kind] > KIND_PRIORITY[existing.kind] ? incoming : existing
  // Prefer the full pull payload over a search hit: it carries merged_at and diff stats.
  buckets.set(key, { ...winner, item: isRawPull(incoming.item) ? incoming.item : existing.item })
}

export function toIssueRow(id: string, { item, kind, repo }: IssueBucket): NewGithubIssue {
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
