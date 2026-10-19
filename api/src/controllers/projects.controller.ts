import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { idParams, okResponse } from "../dto/common.dto"
import { createProjectBody, listProjectsQuery, moveProjectBody, updateProjectBody } from "../dto/projects.dto"

export const projectsController: FastifyPluginAsyncZod = async (app) => {
  const { projects } = app.services

  app.get("/projects", { schema: { querystring: listProjectsQuery } }, (request) => projects.list(request.query))

  app.post("/projects", { schema: { body: createProjectBody } }, async (request, reply) =>
    reply.code(201).send(await projects.create(request.body)),
  )

  app.get("/projects/:id", { schema: { params: idParams } }, (request) =>
    projects.get(request.params.id),
  )

  app.get("/projects/:id/history", { schema: { params: idParams } }, (request) =>
    projects.history(request.params.id),
  )

  app.patch("/projects/:id", { schema: { params: idParams, body: updateProjectBody } }, (request) =>
    projects.update(request.params.id, request.body),
  )

  app.patch("/projects/:id/move", { schema: { params: idParams, body: moveProjectBody } }, (request) =>
    projects.move(request.params.id, request.body),
  )

  app.post("/projects/:id/archive", { schema: { params: idParams } }, (request) =>
    projects.archive(request.params.id),
  )

  app.post("/projects/:id/restore", { schema: { params: idParams } }, (request) =>
    projects.restore(request.params.id),
  )

  app.delete("/projects/:id", { schema: { params: idParams } }, async (request) => {
    await projects.remove(request.params.id)
    return okResponse
  })
}
