import { formatDate, fromDayKey, lastDays } from "@/lib/dates"
import { i18n } from "@/lib/i18n"
import type { MoodChartPoint, MoodEntry, MoodOption } from "@/types/mood"

export function getMoodOptions(): MoodOption[] {
  return [
    { score: 1, label: i18n.t("mood.awful"), emoji: "😞" },
    { score: 2, label: i18n.t("mood.bad"), emoji: "🙁" },
    { score: 3, label: i18n.t("mood.okay"), emoji: "😐" },
    { score: 4, label: i18n.t("mood.good"), emoji: "🙂" },
    { score: 5, label: i18n.t("mood.great"), emoji: "😄" },
  ]
}

export function moodOption(score: number) {
  const options = getMoodOptions()
  return options.find((option) => option.score === score) ?? options[2]
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
