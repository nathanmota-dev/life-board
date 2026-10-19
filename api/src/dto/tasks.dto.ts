import { z } from "zod"
import { TASK_COLORS, TASK_PRIORITIES, TASK_STATUSES } from "../db/schema"
import { idList, limit, tagList } from "./common.dto"

// Query strings carry booleans as text, and `z.coerce.boolean()` would read "false" as true.
const queryBoolean = z.enum(["true", "false"]).transform((value) => value === "true")

const taskFields = {
  title: z.string().min(1).max(500),
  description: z.string().max(10_000).nullable(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  dueAt: z.coerce.date().nullable(),
  parentTaskId: z.string().nullable(),
  tags: tagList,
  linkedThoughtIds: idList,
  pinned: z.boolean(),
  color: z.enum(TASK_COLORS).nullable(),
}

export const createTaskBody = z
  .object({ ...taskFields, items: z.array(z.string().trim().min(1).max(500)).max(100) })
  .partial()
  .required({ title: true })

export const updateTaskBody = z
  .object({ ...taskFields, completedAt: z.coerce.date().nullable(), archivedAt: z.coerce.date().nullable() })
  .partial()

export const listTasksQuery = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  limit: limit(500, 50),
  search: z.string().max(200).optional(),
  parentTaskId: z.string().optional(),
  tag: z.string().max(40).optional(),
  include: z.enum(["children"]).optional(),
  pinned: queryBoolean.optional(),
  color: z.enum(TASK_COLORS).optional(),
  archived: queryBoolean.optional(),
})

// Top-level tasks with their new position and section, saved together.
export const reorderTasksBody = z
  .array(z.object({ id: z.string().min(1), order: z.number().int(), pinned: z.boolean() }))
  .min(1)
  .max(1_000)

export type CreateTaskBody = z.infer<typeof createTaskBody>
export type UpdateTaskBody = z.infer<typeof updateTaskBody>
export type ListTasksQuery = z.infer<typeof listTasksQuery>
export type ReorderTasksBody = z.infer<typeof reorderTasksBody>
