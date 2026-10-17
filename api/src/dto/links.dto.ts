import { z } from "zod"

const ids = z.array(z.string()).max(100).default([])

export const resolveLinksBody = z.object({
  taskIds: ids,
  thoughtIds: ids,
  calendarIds: ids,
  goalIds: ids,
})

export const BACKLINK_TARGETS = ["task", "thought"] as const

export const backlinksParams = z.object({
  kind: z.enum(BACKLINK_TARGETS),
  id: z.string().min(1),
})

export type ResolveLinksBody = z.infer<typeof resolveLinksBody>
export type BacklinkTarget = z.infer<typeof backlinksParams>
