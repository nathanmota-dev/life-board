export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string = code,
  ) {
    super(message)
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Resource not found.") {
    super(404, "not_found", message)
  }
}

export class BadRequestError extends HttpError {
  constructor(code: string, message?: string) {
    super(400, code, message)
  }
}
