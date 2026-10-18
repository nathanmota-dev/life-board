import { fromDayKey } from "@/lib/dates"
import { humanize } from "@/lib/format"
import {
  GITHUB_ISSUE_KINDS,
  GITHUB_KINDS,
  type ContributionDay,
  type ContributionMonthLabel,
  type ContributionWeek,
  type GithubItemType,
  type GithubKind,
  type GithubPr,
} from "@/types/github"
import type { StatusTone } from "@/types/ui"

export function kindLabel(kind: GithubKind) {
  return kind === "in_my_repos" ? "My repos" : humanize(kind)
}

export const KIND_OPTIONS = GITHUB_KINDS.map((value) => ({ value, label: kindLabel(value) }))

export const ITEM_TYPE_OPTIONS: { value: GithubItemType; label: string }[] = [
  { value: "prs", label: "Pull requests" },
  { value: "issues", label: "Issues" },
]

export const ISSUE_KIND_OPTIONS = GITHUB_ISSUE_KINDS.map((value) => ({ value, label: kindLabel(value) }))

export const PR_STATE_TONES: Record<GithubPr["state"], StatusTone> = { open: "success", merged: "brand", closed: "neutral" }

export function prStateLabel(pr: GithubPr) {
  return pr.draft && pr.state === "open" ? "Draft" : humanize(pr.state)
}

export const CONTRIBUTION_LEVELS = [0, 1, 2, 3, 4]
// Empty days use the muted surface; active days blend toward the accent so Settings recolors the grid.
const LEVEL_ACCENT_PERCENT = [0, 30, 55, 80, 100]
// Months closer than this many weeks to the next one are skipped so labels never overlap.
const MIN_MONTH_LABEL_WEEKS = 3

/** Number of week columns the contributions grid draws for `days` (weeks start on Sunday). */
export function contributionWeeks(days: { date: string }[]) {
  if (days.length === 0) return 53
  return Math.ceil((fromDayKey(days[0].date).getDay() + days.length) / 7)
}

/** Splits consecutive `days` into Sunday-first week columns, padding the first and last week with `null`. */
export function contributionGrid(days: ContributionDay[]): ContributionWeek[] {
  if (days.length === 0) return []
  const cells: (ContributionDay | null)[] = [...Array<null>(fromDayKey(days[0].date).getDay()).fill(null), ...days]
  return Array.from({ length: Math.ceil(cells.length / 7) }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => cells[week * 7 + weekday] ?? null),
  )
}

/** Short month names placed on the first week column of each month. */
export function contributionMonthLabels(weeks: ContributionWeek[]): ContributionMonthLabel[] {
  const labels: ContributionMonthLabel[] = []
  let previousMonth = -1
  weeks.forEach((week, index) => {
    const first = week.find((day) => day !== null)
    if (!first) return
    const date = fromDayKey(first.date)
    if (date.getMonth() === previousMonth) return
    previousMonth = date.getMonth()
    labels.push({ week: index, label: date.toLocaleDateString("en-US", { month: "short" }) })
  })
  return labels.filter((label, index) => {
    const nextWeek = labels[index + 1]?.week ?? weeks.length
    return nextWeek - label.week >= MIN_MONTH_LABEL_WEEKS
  })
}

export function contributionLevelColor(level: number) {
  const percent = LEVEL_ACCENT_PERCENT[Math.min(Math.max(level, 0), LEVEL_ACCENT_PERCENT.length - 1)]
  return percent === 0 ? "var(--muted)" : `color-mix(in oklab, var(--primary) ${percent}%, var(--muted))`
}
