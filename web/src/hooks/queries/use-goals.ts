import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { goalsService } from "@/services/goals-service"
import type { GoalProgressFilters, GoalUpdate, MilestoneInput, MilestoneUpdate } from "@/types/goal"

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

export function useGoalProgress(id: string, filters: GoalProgressFilters) {
  return useQuery({
    queryKey: [...queryKeys.goals, "progress", id, filters],
    queryFn: () => goalsService.progress(id, filters),
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
    ({ goalId, input }: { goalId: string; input: MilestoneInput }) => goalsService.addMilestone(goalId, input),
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
