import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { projectsService } from "@/services/projects-service"
import type { Project, ProjectInput } from "@/types/project"

const listKey = [...queryKeys.projects, "list"]

export function useProjects() {
  return useQuery({ queryKey: listKey, queryFn: projectsService.list })
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

export function useRemoveProject() {
  return useInvalidatingMutation(projectsService.remove, [queryKeys.projects])
}

/** Applies the new order right away so the dropped card doesn't jump back while the request runs. */
export function useReorderProjects() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projects: Project[]) => projectsService.reorder(projects.map((project) => project.id)),
    onMutate: async (projects) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      const previous = queryClient.getQueryData<Project[]>(listKey)
      queryClient.setQueryData(listKey, projects)
      return { previous }
    },
    onError: (_error, _projects, context) => queryClient.setQueryData(listKey, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
  })
}
