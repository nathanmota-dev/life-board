import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { idParams, okResponse } from "../dto/common.dto"
import { createTaskBody, listTasksQuery, updateTaskBody } from "../dto/tasks.dto"

export const tasksController: FastifyPluginAsyncZod = async (app) => {
  const { tasks } = app.services

  app.get("/tasks", { schema: { querystring: listTasksQuery } }, async (request) => ({
    items: await tasks.list(request.query),
  }))

  app.post("/tasks", { schema: { body: createTaskBody } }, async (request, reply) =>
    reply.code(201).send(await tasks.create(request.body)),
  )

  app.get("/tasks/:id", { schema: { params: idParams } }, (request) =>
    tasks.get(request.params.id),
  )

  app.patch("/tasks/:id", { schema: { params: idParams, body: updateTaskBody } }, (request) =>
    tasks.update(request.params.id, request.body),
  )

  app.delete("/tasks/:id", { schema: { params: idParams } }, async (request) => {
    await tasks.remove(request.params.id)
    return okResponse
  })
}
