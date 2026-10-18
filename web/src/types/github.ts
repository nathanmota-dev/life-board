export const GITHUB_KINDS = ["authored", "review_requested", "mentioned", "assigned", "in_my_repos"] as const

export type GithubKind = (typeof GITHUB_KINDS)[number]

export const GITHUB_ISSUE_KINDS = ["authored", "mentioned", "assigned", "in_my_repos"] as const

export type GithubIssueKind = (typeof GITHUB_ISSUE_KINDS)[number]

export type GithubStatus = {
  connected: boolean
  login: string | null
  lastSyncAt: string | null
  lastSyncError: string | null
}

export type GithubPr = {
  id: string
  number: number
  title: string
  state: "open" | "closed" | "merged"
  draft: boolean
  repoOwner: string
  repoName: string
  authorLogin: string
  authorAvatarUrl: string | null
  url: string
  baseBranch: string | null
  headBranch: string | null
  kind: GithubKind
  additions: number
  deletions: number
  changedFiles: number
  updatedAt: string
}

export type GithubIssue = {
  id: string
  number: number
  title: string
  state: "open" | "closed"
  repoOwner: string
  repoName: string
  authorLogin: string
  authorAvatarUrl: string | null
  url: string
  kind: GithubIssueKind
  labels: string[]
  comments: number
  updatedAt: string
}

export type ContributionDay = { date: string; count: number; level: number }

export type Contributions = { login: string; total: number; days: ContributionDay[] }

export type GithubConnectInput = { token: string; orgFilter?: string | null }

export type GithubSyncResult = { ok: true; count: number; issues: number; login: string }

export type GithubConnectedProps = { status: GithubStatus }

export type GithubView = "all" | GithubKind

export type GithubIssueView = "all" | GithubIssueKind

export type GithubItemType = "prs" | "issues"

export type GithubPrTableProps = { prs: GithubPr[] }

export type GithubPrRowProps = { pr: GithubPr }

export type GithubIssueTableProps = { issues: GithubIssue[] }

export type GithubIssueRowProps = { issue: GithubIssue }

export type GithubDashboardProps = { status: GithubStatus }


export type ContributionsCalendarProps = { enabled: boolean }
