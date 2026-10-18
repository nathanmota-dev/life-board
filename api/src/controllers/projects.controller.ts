import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { idParams, okResponse } from "../dto/common.dto"
import { createProjectBody, reorderProjectsBody, updateProjectBody } from "../dto/projects.dto"

export const projectsController: FastifyPluginAsyncZod = async (app) => {
  const { projects } = app.services

  app.get("/projects", () => projects.list())

  app.post("/projects", { schema: { body: createProjectBody } }, async (request, reply) =>
    reply.code(201).send(await projects.create(request.body)),
  )

  app.put("/projects/order", { schema: { body: reorderProjectsBody } }, (request) =>
    projects.reorder(request.body),
  )

  app.get("/projects/:id", { schema: { params: idParams } }, (request) =>
    projects.get(request.params.id),
  )

  app.patch("/projects/:id", { schema: { params: idParams, body: updateProjectBody } }, (request) =>
    projects.update(request.params.id, request.body),
  )

  app.delete("/projects/:id", { schema: { params: idParams } }, async (request) => {
    await projects.remove(request.params.id)
    return okResponse
  })
}
