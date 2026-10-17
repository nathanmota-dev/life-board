import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"

export type Authenticate = (request: FastifyRequest, reply: FastifyReply) => Promise<void>

declare module "fastify" {
  interface FastifyInstance {
    authenticate: Authenticate
  }
}

// There is no auth yet, so every request is allowed. When login arrives, this
// is where the session cookie gets validated (and `request.user` attached);
// routes registered through `registerProtected` pick it up without changes.
const allowAll: Authenticate = async () => {}

export function registerAuth(app: FastifyInstance, authenticate: Authenticate = allowAll) {
  app.decorate("authenticate", authenticate)
}

export function registerProtected(
  app: FastifyInstance,
  routes: (scope: FastifyInstance) => Promise<void> | void,
) {
  return app.register(async (scope) => {
    scope.addHook("onRequest", scope.authenticate)
    await routes(scope)
  })
}
