import { api } from "@/services/api-client"
import type { WeekStats } from "@/types/stats"

export const statsService = {
  thisWeek: () => api.get<WeekStats>("/stats/this-week"),
}
