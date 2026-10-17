import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { idParams, okResponse } from "../dto/common.dto"
import { createThoughtBody, listThoughtsQuery, updateThoughtBody } from "../dto/thoughts.dto"

export const thoughtsController: FastifyPluginAsyncZod = async (app) => {
  const { thoughts } = app.services

  app.get("/thoughts", { schema: { querystring: listThoughtsQuery } }, (request) =>
    thoughts.list(request.query),
  )

  app.post("/thoughts", { schema: { body: createThoughtBody } }, async (request, reply) =>
    reply.code(201).send(await thoughts.create(request.body)),
  )

  app.get("/thoughts/:id", { schema: { params: idParams } }, (request) =>
    thoughts.get(request.params.id),
  )

  app.patch("/thoughts/:id", { schema: { params: idParams, body: updateThoughtBody } }, (request) =>
    thoughts.update(request.params.id, request.body),
  )

  app.delete("/thoughts/:id", { schema: { params: idParams } }, async (request) => {
    await thoughts.remove(request.params.id)
    return okResponse
  })
}
