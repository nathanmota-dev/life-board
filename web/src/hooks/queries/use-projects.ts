import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { applyProjectMove } from "@/lib/projects"
import { projectsService } from "@/services/projects-service"
import type { Project, ProjectInput, ProjectMove } from "@/types/project"

const listKey = [...queryKeys.projects, "list"]

export function useProjects() {
  return useQuery({ queryKey: listKey, queryFn: projectsService.list })
}

export function useArchivedProjects() {
  return useQuery({ queryKey: [...queryKeys.projects, "archived"], queryFn: projectsService.listArchived })
}

export function useProjectHistory(id: string) {
  return useQuery({ queryKey: [...queryKeys.projects, "history", id], queryFn: () => projectsService.history(id) })
}

export function useCreateProject() {
  return useInvalidatingMutation(projectsService.create, [queryKeys.projects])
}

export function useUpdateProject() {
  return useInvalidatingMutation(
    ({ id, input }: { id: string; input: ProjectInput }) => projectsService.update(id, input),
    [queryKeys.projects],
  )
}

export function useArchiveProject() {
  return useInvalidatingMutation(projectsService.archive, [queryKeys.projects])
}

export function useRestoreProject() {
  return useInvalidatingMutation(projectsService.restore, [queryKeys.projects])
}

export function useRemoveProject() {
  return useInvalidatingMutation(projectsService.remove, [queryKeys.projects])
}

/** Applies the move right away so the dropped card doesn't jump back while the request runs. */
export function useMoveProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: ProjectMove) => projectsService.move(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      const previous = queryClient.getQueryData<Project[]>(listKey)
      if (previous) queryClient.setQueryData(listKey, applyProjectMove(previous, id, input))
      return { previous }
    },
    onError: (_error, _move, context) => queryClient.setQueryData(listKey, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
  })
}
