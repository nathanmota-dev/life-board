import Fastify from "fastify"
import { describe, expect, it } from "vitest"
import { BadRequestError, NotFoundError } from "../services/errors"
import { registerErrorHandler } from "./error-handler"

function appThatThrows(error: unknown) {
  const app = Fastify()
  registerErrorHandler(app)
  app.get("/", async () => {
    throw error
  })
  return app
}

describe("error handler", () => {
  it("maps domain errors to their status codes", async () => {
    const notFound = await appThatThrows(new NotFoundError()).inject("/")
    expect(notFound.statusCode).toBe(404)
    expect(notFound.json()).toEqual({ error: "not_found", message: "Resource not found." })

    const badRequest = await appThatThrows(new BadRequestError("bad_thing")).inject("/")
    expect(badRequest.json()).toEqual({ error: "bad_thing", message: "bad_thing" })
  })

  it("passes client errors through and hides server errors", async () => {
    const clientError = Object.assign(new Error("Too big"), { statusCode: 413, code: "FST_TOO_LARGE" })
    expect((await appThatThrows(clientError).inject("/")).json()).toEqual({ error: "FST_TOO_LARGE", message: "Too big" })

    const noCode = Object.assign(new Error("Nope"), { statusCode: 400 })
    expect((await appThatThrows(noCode).inject("/")).json().error).toBe("bad_request")

    const crash = await appThatThrows(new Error("db exploded")).inject("/")
    expect(crash.statusCode).toBe(500)
    expect(crash.json()).toEqual({ error: "internal_error", message: "Something went wrong." })
  })
})
