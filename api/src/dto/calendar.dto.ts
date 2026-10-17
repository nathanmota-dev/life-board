import { z } from "zod"
import { hexColor, idList, limit } from "./common.dto"

const eventFields = {
  title: z.string().min(1).max(200),
  description: z.string().max(2_000).nullable(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  allDay: z.boolean(),
  location: z.string().max(200).nullable(),
  color: hexColor,
  linkedTaskIds: idList,
  linkedThoughtIds: idList,
}

export const createEventBody = z
  .object(eventFields)
  .partial()
  .required({ title: true, startAt: true, endAt: true })

export const updateEventBody = z.object(eventFields).partial()

export const listEventsQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: limit(500, 200),
})

export type CreateEventBody = z.infer<typeof createEventBody>
export type UpdateEventBody = z.infer<typeof updateEventBody>
export type ListEventsQuery = z.infer<typeof listEventsQuery>
