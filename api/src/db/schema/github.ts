import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { bool, jsonArray, timestamp, timestamps } from "../columns"

export const GITHUB_KINDS = ["authored", "review_requested", "mentioned", "assigned", "in_my_repos"] as const
export type GithubKind = (typeof GITHUB_KINDS)[number]

// Issues have no review requests, so they use a subset of the PR kinds.
export const GITHUB_ISSUE_KINDS = ["authored", "mentioned", "assigned", "in_my_repos"] as const
export type GithubIssueKind = (typeof GITHUB_ISSUE_KINDS)[number]

// Single row (id = "default"). The PAT is stored encrypted with AES-256-GCM.
export const githubSettings = sqliteTable("github_settings", {
  id: text("id").primaryKey(),
  tokenCiphertext: text("token_ciphertext").notNull(),
  tokenIv: text("token_iv").notNull(),
  tokenTag: text("token_tag").notNull(),
  login: text("login").notNull(),
  orgFilter: text("org_filter"),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncError: text("last_sync_error"),
  ...timestamps(),
})

export const githubPrs = sqliteTable(
  "github_prs",
  {
    // `${owner}/${repo}#${number}`, so re-syncs upsert the same row.
    id: text("id").primaryKey(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    state: text("state").notNull(),
    draft: bool("draft").notNull().default(false),
    repoOwner: text("repo_owner").notNull(),
    repoName: text("repo_name").notNull(),
    authorLogin: text("author_login").notNull(),
    authorAvatarUrl: text("author_avatar_url"),
    url: text("url").notNull(),
    baseBranch: text("base_branch"),
    headBranch: text("head_branch"),
    kind: text("kind", { enum: GITHUB_KINDS }).notNull(),
    triggeredByLogin: text("triggered_by_login"),
    additions: integer("additions").notNull().default(0),
    deletions: integer("deletions").notNull().default(0),
    changedFiles: integer("changed_files").notNull().default(0),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    syncedAt: timestamp("synced_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("github_prs_kind_idx").on(t.kind), index("github_prs_updated_idx").on(t.updatedAt)],
)

export const githubIssues = sqliteTable(
  "github_issues",
  {
    // `${owner}/${repo}#${number}`, so re-syncs upsert the same row.
    id: text("id").primaryKey(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    state: text("state").notNull(),
    repoOwner: text("repo_owner").notNull(),
    repoName: text("repo_name").notNull(),
    authorLogin: text("author_login").notNull(),
    authorAvatarUrl: text("author_avatar_url"),
    url: text("url").notNull(),
    kind: text("kind", { enum: GITHUB_ISSUE_KINDS }).notNull(),
    labels: jsonArray("labels"),
    comments: integer("comments").notNull().default(0),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    syncedAt: timestamp("synced_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("github_issues_kind_idx").on(t.kind), index("github_issues_updated_idx").on(t.updatedAt)],
)

export type GithubSettings = typeof githubSettings.$inferSelect
export type GithubPr = typeof githubPrs.$inferSelect
export type NewGithubPr = typeof githubPrs.$inferInsert
export type GithubIssue = typeof githubIssues.$inferSelect
export type NewGithubIssue = typeof githubIssues.$inferInsert
