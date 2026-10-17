import { z } from "zod"
import { GOAL_DOMAINS, GOAL_STATUSES } from "../db/schema"
import { hexColor, idList } from "./common.dto"

const milestoneFields = {
  title: z.string().min(1).max(200),
  dueAt: z.coerce.date().nullable(),
}

const goalFields = {
  title: z.string().min(1).max(200),
  why: z.string().max(2_000).nullable(),
  domain: z.enum(GOAL_DOMAINS),
  startAt: z.coerce.date().nullable(),
  targetAt: z.coerce.date().nullable(),
  color: hexColor,
  linkedTaskIds: idList,
  linkedThoughtIds: idList,
}

export const createGoalBody = z
  .object({
    ...goalFields,
    milestones: z.array(z.object(milestoneFields).partial().required({ title: true })).max(20),
  })
  .partial()
  .required({ title: true })

export const updateGoalBody = z
  .object({
    ...goalFields,
    status: z.enum(GOAL_STATUSES),
    completedAt: z.coerce.date().nullable(),
    progress: z.number().int().min(0).max(100),
  })
  .partial()

export const createMilestoneBody = z.object(milestoneFields).partial().required({ title: true })

export const updateMilestoneBody = z
  .object({ ...milestoneFields, completedAt: z.coerce.date().nullable() })
  .partial()

export const milestoneParams = z.object({
  goalId: z.string().min(1),
  milestoneId: z.string().min(1),
})

export type CreateGoalBody = z.infer<typeof createGoalBody>
export type UpdateGoalBody = z.infer<typeof updateGoalBody>
export type CreateMilestoneBody = z.infer<typeof createMilestoneBody>
export type UpdateMilestoneBody = z.infer<typeof updateMilestoneBody>
