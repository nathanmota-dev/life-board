import { z } from "zod"
import { idList, limit, tagList } from "./common.dto"

const thoughtFields = {
  title: z.string().max(200).nullable(),
  body: z.string().max(50_000),
  tags: tagList,
  pinned: z.boolean(),
  linkedTaskIds: idList,
}

export const createThoughtBody = z.object(thoughtFields).partial()

export const updateThoughtBody = createThoughtBody

export const listThoughtsQuery = z.object({
  limit: limit(100, 50),
  // Opaque cursor returned as `nextCursor` by the previous page.
  cursor: z.string().regex(/^[01]:\d+:\w+$/, "Invalid cursor").optional(),
  pinned: z.stringbool().optional(),
  tag: z.string().max(40).optional(),
  search: z.string().max(200).optional(),
})

export type CreateThoughtBody = z.infer<typeof createThoughtBody>
export type UpdateThoughtBody = z.infer<typeof updateThoughtBody>
export type ListThoughtsQuery = z.infer<typeof listThoughtsQuery>
