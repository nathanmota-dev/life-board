import { fromDayKey } from "@/lib/dates"
import { humanize } from "@/lib/format"
import { GITHUB_KINDS, type GithubPr } from "@/types/github"
import type { StatusTone } from "@/types/ui"

export const KIND_OPTIONS = GITHUB_KINDS.map((value) => ({ value, label: value === "in_my_repos" ? "My repos" : humanize(value) }))

export const PR_STATE_TONES: Record<GithubPr["state"], StatusTone> = { open: "success", merged: "brand", closed: "neutral" }

export function prStateLabel(pr: GithubPr) {
  return pr.draft && pr.state === "open" ? "Draft" : humanize(pr.state)
}

export function kindLabel(kind: GithubPr["kind"]) {
  return KIND_OPTIONS.find((option) => option.value === kind)?.label ?? humanize(kind)
}

export const CALENDAR_BLOCK_MARGIN = 3
const CALENDAR_MIN_BLOCK = 8
const CALENDAR_MAX_BLOCK = 20

/** Number of week columns the contributions grid draws for `days` (weeks start on Sunday). */
export function contributionWeeks(days: { date: string }[]) {
  if (days.length === 0) return 53
  return Math.ceil((fromDayKey(days[0].date).getDay() + days.length) / 7)
}

/** Largest block size that fits every week column into `width`, clamped to stay readable. */
export function contributionBlockSize(width: number, weeks: number) {
  if (width <= 0) return 11
  const size = Math.floor(width / weeks) - CALENDAR_BLOCK_MARGIN
  return Math.min(CALENDAR_MAX_BLOCK, Math.max(CALENDAR_MIN_BLOCK, size))
}
