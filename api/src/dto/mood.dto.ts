import { z } from "zod"
import { dayKey, idList, limit } from "./common.dto"

export const upsertMoodBody = z.object({
  score: z.number().int().min(1).max(5),
  note: z.string().max(2_000).nullable().optional(),
  day: dayKey.optional(),
  linkedTaskIds: idList.optional(),
})

export const listMoodQuery = z.object({ limit: limit(365, 90) })

export type UpsertMoodBody = z.infer<typeof upsertMoodBody>
