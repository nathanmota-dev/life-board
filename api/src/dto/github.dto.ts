import { z } from "zod"
import { GITHUB_KINDS } from "../db/schema"
import { limit } from "./common.dto"

export const connectGithubBody = z.object({
  token: z.string().min(20).max(200),
  orgFilter: z.string().max(120).nullable().optional(),
})

export const listPrsQuery = z.object({
  kind: z.enum(GITHUB_KINDS).optional(),
  limit: limit(200, 100),
})

export type ConnectGithubBody = z.infer<typeof connectGithubBody>
export type ListPrsQuery = z.infer<typeof listPrsQuery>
