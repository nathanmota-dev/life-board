import { api } from "@/services/api-client"
import type { ListResponse, OkResponse } from "@/types/api"
import type {
  Goal,
  GoalDetail,
  GoalInput,
  GoalProgressFilters,
  GoalProgressHistory,
  GoalUpdate,
  Milestone,
  MilestoneInput,
  MilestoneUpdate,
} from "@/types/goal"

export const goalsService = {
  list: async () => (await api.get<ListResponse<Goal>>("/goals")).items,
  get: (id: string) => api.get<GoalDetail>(`/goals/${id}`),
  create: async (input: GoalInput) => (await api.post<{ goal: Goal }>("/goals", input)).goal,
  update: (id: string, input: GoalUpdate) => api.patch<Goal>(`/goals/${id}`, input),
  remove: (id: string) => api.delete<OkResponse>(`/goals/${id}`),
  progress: (id: string, filters: GoalProgressFilters) => api.get<GoalProgressHistory>(`/goals/${id}/progress`, filters),
  addMilestone: (goalId: string, input: MilestoneInput) => api.post<Milestone>(`/goals/${goalId}/milestones`, input),
  updateMilestone: (goalId: string, milestoneId: string, input: MilestoneUpdate) =>
    api.patch<Milestone>(`/goals/${goalId}/milestones/${milestoneId}`, input),
  removeMilestone: (goalId: string, milestoneId: string) =>
    api.delete<OkResponse>(`/goals/${goalId}/milestones/${milestoneId}`),
}
