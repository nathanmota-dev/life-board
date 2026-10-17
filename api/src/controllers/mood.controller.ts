import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { idParams, okResponse } from "../dto/common.dto"
import { listMoodQuery, upsertMoodBody } from "../dto/mood.dto"

export const moodController: FastifyPluginAsyncZod = async (app) => {
  const { mood } = app.services

  app.get("/mood/today", () => mood.today())

  app.get("/mood/entries", { schema: { querystring: listMoodQuery } }, async (request) => ({
    items: await mood.list(request.query.limit),
  }))

  app.post("/mood/entries", { schema: { body: upsertMoodBody } }, async (request, reply) => {
    const { entry, created } = await mood.upsert(request.body)
    return reply.code(created ? 201 : 200).send(entry)
  })

  app.delete("/mood/entries/:id", { schema: { params: idParams } }, async (request) => {
    await mood.remove(request.params.id)
    return okResponse
  })
}
