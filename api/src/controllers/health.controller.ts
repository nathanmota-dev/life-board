import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"

export const healthController: FastifyPluginAsyncZod = async (app) => {
  app.get("/health", () => ({
    ok: true,
    service: "life-board-api",
    time: new Date().toISOString(),
  }))
}
