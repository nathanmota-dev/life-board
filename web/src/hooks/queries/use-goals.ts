import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { goalsService } from "@/services/goals-service"
import type { GoalUpdate, MilestoneUpdate } from "@/types/goal"

export function useGoals() {
  return useQuery({ queryKey: [...queryKeys.goals, "list"], queryFn: goalsService.list })
}

export function useGoal(id: string | null) {
  return useQuery({
    queryKey: [...queryKeys.goals, "detail", id],
    queryFn: () => goalsService.get(id!),
    enabled: id !== null,
  })
}

export function useCreateGoal() {
  return useInvalidatingMutation(goalsService.create, [queryKeys.goals])
}

export function useUpdateGoal() {
  return useInvalidatingMutation(
    ({ id, input }: { id: string; input: GoalUpdate }) => goalsService.update(id, input),
    [queryKeys.goals],
  )
}

export function useRemoveGoal() {
  return useInvalidatingMutation(goalsService.remove, [queryKeys.goals])
}

export function useAddMilestone() {
  return useInvalidatingMutation(
    ({ goalId, title }: { goalId: string; title: string }) => goalsService.addMilestone(goalId, title),
    [queryKeys.goals],
  )
}

export function useUpdateMilestone() {
  return useInvalidatingMutation(
    ({ goalId, milestoneId, input }: { goalId: string; milestoneId: string; input: MilestoneUpdate }) =>
      goalsService.updateMilestone(goalId, milestoneId, input),
    [queryKeys.goals],
  )
}

export function useRemoveMilestone() {
  return useInvalidatingMutation(
    ({ goalId, milestoneId }: { goalId: string; milestoneId: string }) => goalsService.removeMilestone(goalId, milestoneId),
    [queryKeys.goals],
  )
}
