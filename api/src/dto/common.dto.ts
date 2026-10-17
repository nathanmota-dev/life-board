import { z } from "zod"

export const idParams = z.object({ id: z.string().min(1) })

export const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD day")

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a #rrggbb color")

export const tagList = z.array(z.string().max(40)).max(20)

export const idList = z.array(z.string()).max(50)

export const limit = (max: number, fallback: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback)

export const okResponse = { ok: true } as const
