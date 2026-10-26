import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { idParams, okResponse } from "../dto/common.dto"
import { createHabitBody, habitLogParams, listHabitLogsQuery, logHabitBody, setHabitLogBody, updateHabitBody } from "../dto/habits.dto"

export const habitsController: FastifyPluginAsyncZod = async (app) => {
  const { habits } = app.services

  app.get("/habits", async () => ({ items: await habits.list() }))

  app.post("/habits", { schema: { body: createHabitBody } }, async (request, reply) =>
    reply.code(201).send(await habits.create(request.body)),
  )

  app.patch("/habits/:id", { schema: { params: idParams, body: updateHabitBody } }, (request) =>
    habits.update(request.params.id, request.body),
  )

  app.delete("/habits/:id", { schema: { params: idParams } }, async (request) => {
    await habits.remove(request.params.id)
    return okResponse
  })

  app.get("/habits/logs", { schema: { querystring: listHabitLogsQuery } }, async (request) => ({
    items: await habits.logs(request.query),
  }))

  app.post("/habits/:id/logs", { schema: { params: idParams, body: logHabitBody } }, (request) =>
    habits.log(request.params.id, request.body),
  )

  app.put("/habits/:id/logs/:day", { schema: { params: habitLogParams, body: setHabitLogBody } }, (request) =>
    habits.setLog(request.params.id, request.params.day, request.body),
  )
}
