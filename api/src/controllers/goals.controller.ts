import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { idParams, okResponse } from "../dto/common.dto"
import {
  createGoalBody,
  createMilestoneBody,
  milestoneParams,
  updateGoalBody,
  updateMilestoneBody,
} from "../dto/goals.dto"

export const goalsController: FastifyPluginAsyncZod = async (app) => {
  const { goals } = app.services

  app.get("/goals", async () => ({ items: await goals.list() }))

  app.post("/goals", { schema: { body: createGoalBody } }, async (request, reply) =>
    reply.code(201).send(await goals.create(request.body)),
  )

  app.get("/goals/:id", { schema: { params: idParams } }, (request) => goals.get(request.params.id))

  app.patch("/goals/:id", { schema: { params: idParams, body: updateGoalBody } }, (request) =>
    goals.update(request.params.id, request.body),
  )

  app.delete("/goals/:id", { schema: { params: idParams } }, async (request) => {
    await goals.remove(request.params.id)
    return okResponse
  })

  app.post(
    "/goals/:id/milestones",
    { schema: { params: idParams, body: createMilestoneBody } },
    async (request, reply) => reply.code(201).send(await goals.addMilestone(request.params.id, request.body)),
  )

  app.patch(
    "/goals/:goalId/milestones/:milestoneId",
    { schema: { params: milestoneParams, body: updateMilestoneBody } },
    (request) => goals.updateMilestone(request.params.goalId, request.params.milestoneId, request.body),
  )

  app.delete(
    "/goals/:goalId/milestones/:milestoneId",
    { schema: { params: milestoneParams } },
    async (request) => {
      await goals.removeMilestone(request.params.goalId, request.params.milestoneId)
      return okResponse
    },
  )
}
