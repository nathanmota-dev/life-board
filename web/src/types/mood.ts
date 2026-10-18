export type MoodEntry = {
  id: string
  day: string
  score: number
  note: string | null
  createdAt: string
  updatedAt: string
}

export type MoodToday = { day: string; entry: MoodEntry | null; nextAvailableAt: string }

export type MoodInput = { score: number; note?: string | null; day?: string }

export type MoodOption = { score: number; label: string; emoji: string }

export type MoodChartPoint = { day: string; label: string; score: number }

export type MoodCheckInProps = { today: MoodToday }

export type MoodStatsProps = { entries: MoodEntry[]; today: MoodToday | undefined }

export type MoodEntriesProps = { entries: MoodEntry[] }

export type MoodTrendChartProps = { entries: MoodEntry[] }
