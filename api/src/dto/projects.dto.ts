import { z } from "zod"
import { PROJECT_STATUSES } from "../db/schema"

const pauseReason = z.string().trim().max(200).nullable()

const projectFields = {
  title: z.string().min(1).max(200),
  description: z.string().max(5_000),
  status: z.enum(PROJECT_STATUSES),
  pauseReason,
}

export const createProjectBody = z.object(projectFields).partial().required({ title: true })

export const updateProjectBody = z.object(projectFields).partial()

export const listProjectsQuery = z.object({
  archived: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
})

// `order` is the card's index in the target column once it lands there.
export const moveProjectBody = z.object({
  status: z.enum(PROJECT_STATUSES),
  order: z.number().int().min(0),
  pauseReason: pauseReason.optional(),
})

export type CreateProjectBody = z.infer<typeof createProjectBody>
export type UpdateProjectBody = z.infer<typeof updateProjectBody>
export type ListProjectsQuery = z.infer<typeof listProjectsQuery>
export type MoveProjectBody = z.infer<typeof moveProjectBody>
