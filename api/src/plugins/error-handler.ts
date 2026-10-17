import type { FastifyError, FastifyInstance } from "fastify"
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod"
import { HttpError } from "../services/errors"

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        error: "validation_error",
        message: error.message,
        issues: error.validation.map(({ instancePath, message }) => ({ path: instancePath, message })),
      })
    }
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message })
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.code ?? "bad_request", message: error.message })
    }
    request.log.error(error)
    return reply.code(500).send({ error: "internal_error", message: "Something went wrong." })
  })
}
