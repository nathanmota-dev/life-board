import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { toDayKey } from "@/lib/dates"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { habitsService } from "@/services/habits-service"
import type { HabitInput, HabitLogFilters, HabitLogInput } from "@/types/habit"

export function useHabits() {
  const [day, setDay] = useState(toDayKey())
  useEffect(() => {
    const refreshDay = () => setDay(toDayKey())
    const timer = window.setInterval(refreshDay, 60_000)
    window.addEventListener("focus", refreshDay)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", refreshDay)
    }
  }, [])
  return useQuery({ queryKey: [...queryKeys.habits, "list", day], queryFn: habitsService.list, refetchOnWindowFocus: true })
}

export function useHabitLogs(filters: HabitLogFilters) {
  return useQuery({ queryKey: [...queryKeys.habits, "logs", filters], queryFn: () => habitsService.logs(filters) })
}

export function useCreateHabit() {
  return useInvalidatingMutation(habitsService.create, [queryKeys.habits])
}

export function useUpdateHabit() {
  return useInvalidatingMutation(
    ({ id, input }: { id: string; input: Partial<HabitInput> }) => habitsService.update(id, input),
    [queryKeys.habits, queryKeys.goals],
  )
}

export function useRemoveHabit() {
  return useInvalidatingMutation(habitsService.remove, [queryKeys.habits, queryKeys.goals])
}

export function useLogHabit() {
  return useInvalidatingMutation(
    ({ id, input }: { id: string; input: HabitLogInput }) => habitsService.log(id, input),
    // Goals derive their progress from linked habits.
    [queryKeys.habits, queryKeys.goals],
  )
}

export function useSetHabitLog() {
  return useInvalidatingMutation(habitsService.setLog, [queryKeys.habits, queryKeys.goals])
}
