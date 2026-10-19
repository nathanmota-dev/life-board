import { z } from "zod"
import { dayKey } from "./common.dto"

const habitFields = {
  name: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(40),
  target: z.number().int().min(1).max(10_000),
  step: z.number().int().min(1).max(10_000),
  emoji: z.string().trim().min(1).max(32),
}

export const createHabitBody = z.object(habitFields).partial().required({ name: true, target: true })

export const updateHabitBody = z.object(habitFields).partial()

export const logHabitBody = z.object({
  delta: z.number().int().min(-10_000).max(10_000).refine((value) => value !== 0, "delta cannot be 0"),
  day: dayKey.optional(),
})

export const listHabitLogsQuery = z.object({
  from: dayKey.optional(),
  to: dayKey.optional(),
  habitId: z.string().optional(),
})

export type CreateHabitBody = z.infer<typeof createHabitBody>
export type UpdateHabitBody = z.infer<typeof updateHabitBody>
export type LogHabitBody = z.infer<typeof logHabitBody>
export type ListHabitLogsQuery = z.infer<typeof listHabitLogsQuery>
