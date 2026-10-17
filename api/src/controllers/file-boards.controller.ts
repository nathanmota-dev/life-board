import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { idParams, okResponse } from "../dto/common.dto"
import { createBoardBody, updateBoardBody, updateItemBody, uploadItemFields } from "../dto/file-boards.dto"
import { BadRequestError } from "../services/errors"

export const fileBoardsController: FastifyPluginAsyncZod = async (app) => {
  const { fileBoards } = app.services

  app.get("/file-boards", async () => ({ items: await fileBoards.listBoards() }))

  app.post("/file-boards", { schema: { body: createBoardBody } }, async (request, reply) =>
    reply.code(201).send(await fileBoards.createBoard(request.body)),
  )

  app.patch("/file-boards/:id", { schema: { params: idParams, body: updateBoardBody } }, (request) =>
    fileBoards.updateBoard(request.params.id, request.body),
  )

  app.delete("/file-boards/:id", { schema: { params: idParams } }, async (request) => {
    await fileBoards.removeBoard(request.params.id)
    return okResponse
  })

  app.get("/file-boards/:id/items", { schema: { params: idParams } }, async (request) => ({
    items: await fileBoards.listItems(request.params.id),
  }))

  /** Multipart upload: the binary goes in the `file` field, metadata in plain fields. */
  app.post("/file-boards/:id/items", { schema: { params: idParams } }, async (request, reply) => {
    const upload = request.isMultipart() ? await request.file() : undefined
    if (!upload) throw new BadRequestError("missing_file", 'The "file" field is required.')

    const buffer = await upload.toBuffer()
    const rawFields = Object.fromEntries(
      Object.entries(upload.fields).flatMap(([name, field]) =>
        field && !Array.isArray(field) && field.type === "field" ? [[name, field.value]] : [],
      ),
    )
    const fields = uploadItemFields.safeParse(rawFields)
    if (!fields.success) throw new BadRequestError("validation_error", fields.error.message)

    const item = await fileBoards.addItem(
      request.params.id,
      { buffer, filename: upload.filename, mime: upload.mimetype },
      fields.data,
    )
    return reply.code(201).send(item)
  })

  app.patch("/file-items/:id", { schema: { params: idParams, body: updateItemBody } }, (request) =>
    fileBoards.updateItem(request.params.id, request.body),
  )

  app.delete("/file-items/:id", { schema: { params: idParams } }, async (request) => {
    await fileBoards.removeItem(request.params.id)
    return okResponse
  })

  app.get("/file-items/:id/file", { schema: { params: idParams } }, async (request, reply) => {
    const { item, size, stream } = await fileBoards.openItemFile(request.params.id)
    return reply
      .header("Content-Type", item.mime)
      .header("Content-Length", size)
      .header("Cache-Control", "private, max-age=3600")
      .send(stream)
  })
}
