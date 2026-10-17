import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { createEventBody, listEventsQuery, updateEventBody } from "../dto/calendar.dto"
import { idParams, okResponse } from "../dto/common.dto"

export const calendarController: FastifyPluginAsyncZod = async (app) => {
  const { calendar } = app.services

  app.get("/calendar/events", { schema: { querystring: listEventsQuery } }, async (request) => ({
    items: await calendar.list(request.query),
  }))

  app.post("/calendar/events", { schema: { body: createEventBody } }, async (request, reply) =>
    reply.code(201).send(await calendar.create(request.body)),
  )

  app.patch(
    "/calendar/events/:id",
    { schema: { params: idParams, body: updateEventBody } },
    (request) => calendar.update(request.params.id, request.body),
  )

  app.delete("/calendar/events/:id", { schema: { params: idParams } }, async (request) => {
    await calendar.remove(request.params.id)
    return okResponse
  })
}
