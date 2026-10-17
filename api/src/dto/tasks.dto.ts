import { z } from "zod"
import { TASK_PRIORITIES, TASK_STATUSES } from "../db/schema"
import { idList, limit, tagList } from "./common.dto"

const taskFields = {
  title: z.string().min(1).max(500),
  description: z.string().max(10_000).nullable(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  dueAt: z.coerce.date().nullable(),
  parentTaskId: z.string().nullable(),
  tags: tagList,
  linkedThoughtIds: idList,
}

export const createTaskBody = z.object(taskFields).partial().required({ title: true })

export const updateTaskBody = z
  .object({ ...taskFields, completedAt: z.coerce.date().nullable() })
  .partial()

export const listTasksQuery = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  limit: limit(100, 50),
  search: z.string().max(200).optional(),
  parentTaskId: z.string().optional(),
  tag: z.string().max(40).optional(),
})

export type CreateTaskBody = z.infer<typeof createTaskBody>
export type UpdateTaskBody = z.infer<typeof updateTaskBody>
export type ListTasksQuery = z.infer<typeof listTasksQuery>
