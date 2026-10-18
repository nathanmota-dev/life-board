import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { tasksService } from "@/services/tasks-service"
import type { TaskFilters, TaskUpdate } from "@/types/task"

export function useTasks(filters: TaskFilters = {}) {
  return useQuery({ queryKey: [...queryKeys.tasks, filters], queryFn: () => tasksService.list(filters) })
}

export function useCreateTask() {
  return useInvalidatingMutation(tasksService.create, [queryKeys.tasks])
}

export function useUpdateTask() {
  return useInvalidatingMutation(
    ({ id, input }: { id: string; input: TaskUpdate }) => tasksService.update(id, input),
    [queryKeys.tasks],
  )
}

export function useRemoveTask() {
  return useInvalidatingMutation(tasksService.remove, [queryKeys.tasks])
}
