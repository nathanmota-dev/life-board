import { z } from "zod"
import { BOARD_KINDS, FILE_KINDS } from "../db/schema"
import { hexColor, idList, tagList } from "./common.dto"

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

const boardFields = {
  name: z.string().min(1).max(120),
  description: z.string().max(2_000).nullable(),
  kind: z.enum(BOARD_KINDS),
  color: hexColor,
}

export const createBoardBody = z.object(boardFields).partial().required({ name: true })

export const updateBoardBody = z
  .object({ ...boardFields, coverItemId: z.string().nullable() })
  .partial()

const itemFields = {
  kind: z.enum(FILE_KINDS),
  title: z.string().max(200).nullable(),
  notes: z.string().max(2_000).nullable(),
  amountCents: z.number().int().min(0).nullable(),
  currency: z.string().length(3).nullable(),
  takenAt: z.coerce.date().nullable(),
}

export const updateItemBody = z
  .object({ ...itemFields, tags: tagList, linkedTaskIds: idList })
  .partial()

// Multipart form fields arrive as strings next to the `file` field.
export const uploadItemFields = z.object({
  kind: z.enum(FILE_KINDS).optional(),
  title: z.string().max(200).optional(),
  notes: z.string().max(2_000).optional(),
  amountCents: z.coerce.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  takenAt: z.coerce.date().optional(),
})

export type CreateBoardBody = z.infer<typeof createBoardBody>
export type UpdateBoardBody = z.infer<typeof updateBoardBody>
export type UpdateItemBody = z.infer<typeof updateItemBody>
export type UploadItemFields = z.infer<typeof uploadItemFields>
