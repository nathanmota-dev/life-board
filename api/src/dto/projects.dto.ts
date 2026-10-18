import { z } from "zod"
import { PROJECT_STATUSES } from "../db/schema"

const projectFields = {
  title: z.string().min(1).max(200),
  description: z.string().max(5_000),
  status: z.enum(PROJECT_STATUSES),
}

export const createProjectBody = z.object(projectFields).partial().required({ title: true })

export const updateProjectBody = z.object(projectFields).partial()

// The full list of active project ids, in their new order.
export const reorderProjectsBody = z.object({ ids: z.array(z.string().min(1)).max(1_000) })

export type CreateProjectBody = z.infer<typeof createProjectBody>
export type UpdateProjectBody = z.infer<typeof updateProjectBody>
export type ReorderProjectsBody = z.infer<typeof reorderProjectsBody>
