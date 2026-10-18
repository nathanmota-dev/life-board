import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { habitsService } from "@/services/habits-service"
import type { HabitInput, HabitLogFilters, HabitLogInput } from "@/types/habit"

export function useHabits() {
  return useQuery({ queryKey: [...queryKeys.habits, "list"], queryFn: habitsService.list })
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
    [queryKeys.habits],
  )
}

export function useRemoveHabit() {
  return useInvalidatingMutation(habitsService.remove, [queryKeys.habits])
}

export function useLogHabit() {
  return useInvalidatingMutation(
    ({ id, input }: { id: string; input: HabitLogInput }) => habitsService.log(id, input),
    [queryKeys.habits],
  )
}
