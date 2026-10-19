import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { tasksService } from "@/services/tasks-service"
import type { BoardTask, FocusChange, TaskFilters, TaskOrderItem, TaskUpdate } from "@/types/task"

const boardKey = [...queryKeys.tasks, "board"]

export function useTasks(filters: TaskFilters = {}) {
  return useQuery({ queryKey: [...queryKeys.tasks, filters], queryFn: () => tasksService.list(filters) })
}

/** Top-level tasks with their checklist items, as the board shows them. */
export function useBoardTasks(filters: Omit<TaskFilters, "include"> = {}) {
  return useQuery({ queryKey: [...boardKey, filters], queryFn: () => tasksService.board(filters) })
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

/** Moves tasks in or out of a day's focus one after the other, so the API checks the focus limit in order. */
export function useSetFocusDays() {
  return useInvalidatingMutation(async (changes: FocusChange[]) => {
    for (const { id, focusDay } of changes) await tasksService.update(id, { focusDay })
  }, [queryKeys.tasks])
}

export function useRemoveTask() {
  return useInvalidatingMutation(tasksService.remove, [queryKeys.tasks])
}

/** Applies the new order right away so the dropped card doesn't jump back while the request runs. */
export function useReorderTasks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (items: TaskOrderItem[]) => tasksService.reorder(items),
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: boardKey })
      const previous = queryClient.getQueriesData<BoardTask[]>({ queryKey: boardKey })
      const byId = new Map(items.map((item) => [item.id, item]))
      queryClient.setQueriesData<BoardTask[]>({ queryKey: boardKey }, (tasks) =>
        tasks?.map((task) => ({ ...task, ...byId.get(task.id) })),
      )
      return { previous }
    },
    onError: (_error, _items, context) => {
      for (const [queryKey, data] of context?.previous ?? []) queryClient.setQueryData(queryKey, data)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks }),
  })
}
