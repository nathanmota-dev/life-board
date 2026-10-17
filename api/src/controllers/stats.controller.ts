import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"

export const statsController: FastifyPluginAsyncZod = async (app) => {
  const { stats } = app.services

  app.get("/stats/this-week", () => stats.thisWeek())
}
