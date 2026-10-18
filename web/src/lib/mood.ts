import { formatDate, fromDayKey, lastDays } from "@/lib/dates"
import type { MoodChartPoint, MoodEntry, MoodOption } from "@/types/mood"

export const MOOD_OPTIONS: MoodOption[] = [
  { score: 1, label: "Awful", emoji: "😞" },
  { score: 2, label: "Bad", emoji: "🙁" },
  { score: 3, label: "Okay", emoji: "😐" },
  { score: 4, label: "Good", emoji: "🙂" },
  { score: 5, label: "Great", emoji: "😄" },
]

export function moodOption(score: number) {
  return MOOD_OPTIONS.find((option) => option.score === score) ?? MOOD_OPTIONS[2]
}

/** Average score over the last `days` days, or null with no entries in that window. */
export function averageMood(entries: MoodEntry[], days: number) {
  const window = new Set(lastDays(days))
  const scores = entries.filter((entry) => window.has(entry.day)).map((entry) => entry.score)
  return scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : null
}

export function moodChartData(entries: MoodEntry[], days = 30): MoodChartPoint[] {
  const window = new Set(lastDays(days))
  return entries
    .filter((entry) => window.has(entry.day))
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((entry) => ({ day: entry.day, label: formatDate(fromDayKey(entry.day)), score: entry.score }))
}
