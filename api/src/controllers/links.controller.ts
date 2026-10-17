import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { backlinksParams, resolveLinksBody } from "../dto/links.dto"

export const linksController: FastifyPluginAsyncZod = async (app) => {
  const { links } = app.services

  app.post("/links/resolve", { schema: { body: resolveLinksBody } }, async (request) => ({
    links: await links.resolve(request.body),
  }))

  app.get("/links/backlinks/:kind/:id", { schema: { params: backlinksParams } }, async (request) => ({
    backlinks: await links.backlinks(request.params),
  }))
}
