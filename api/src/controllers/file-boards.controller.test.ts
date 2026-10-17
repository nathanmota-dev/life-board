import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { MAX_UPLOAD_BYTES } from "../dto/file-boards.dto"
import { createTestApp } from "../test/create-test-app"

let ctx: Awaited<ReturnType<typeof createTestApp>>

beforeEach(async () => {
  ctx = await createTestApp()
})
afterEach(() => ctx.cleanup())

function multipart(fields: Record<string, string>, file?: { name: string; type: string; content: Buffer }) {
  const boundary = "life-board-boundary"
  const parts: Buffer[] = Object.entries(fields).map(([name, value]) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`),
  )
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
      ),
      file.content,
      Buffer.from("\r\n"),
    )
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } }
}

async function createBoard() {
  const response = await ctx.app.inject({ method: "POST", url: "/api/file-boards", payload: { name: "Receipts", kind: "receipts" } })
  expect(response.statusCode).toBe(201)
  return response.json().id as string
}

describe("file boards controller", () => {
  it("manages boards", async () => {
    const id = await createBoard()

    expect((await ctx.app.inject({ method: "GET", url: "/api/file-boards" })).json().items).toHaveLength(1)
    expect((await ctx.app.inject({ method: "PATCH", url: `/api/file-boards/${id}`, payload: { name: "Bills" } })).json().name).toBe("Bills")
    expect((await ctx.app.inject({ method: "DELETE", url: `/api/file-boards/${id}` })).json()).toEqual({ ok: true })
  })

  it("uploads, downloads, updates and deletes items", async () => {
    const boardId = await createBoard()
    const upload = await ctx.app.inject({
      method: "POST",
      url: `/api/file-boards/${boardId}/items`,
      ...multipart({ kind: "receipt", amountCents: "1990", title: "Lunch" }, { name: "lunch.png", type: "image/png", content: Buffer.from("png") }),
    })
    expect(upload.statusCode).toBe(201)
    const item = upload.json()
    expect(item).toMatchObject({ kind: "receipt", amountCents: 1990, title: "Lunch", mime: "image/png" })

    expect((await ctx.app.inject({ method: "GET", url: `/api/file-boards/${boardId}/items` })).json().items).toHaveLength(1)

    const download = await ctx.app.inject({ method: "GET", url: `/api/file-items/${item.id}/file` })
    expect(download.statusCode).toBe(200)
    expect(download.headers["content-type"]).toBe("image/png")
    expect(download.body).toBe("png")

    const updated = await ctx.app.inject({ method: "PATCH", url: `/api/file-items/${item.id}`, payload: { notes: "Team lunch" } })
    expect(updated.json().notes).toBe("Team lunch")

    expect((await ctx.app.inject({ method: "DELETE", url: `/api/file-items/${item.id}` })).json()).toEqual({ ok: true })
    expect((await ctx.app.inject({ method: "GET", url: `/api/file-items/${item.id}/file` })).statusCode).toBe(404)
  })

  it("rejects uploads without a file, with bad fields, or over the size limit", async () => {
    const boardId = await createBoard()
    const url = `/api/file-boards/${boardId}/items`

    const noBody = await ctx.app.inject({ method: "POST", url, payload: {} })
    expect(noBody.json().error).toBe("missing_file")

    const noFile = await ctx.app.inject({ method: "POST", url, ...multipart({ title: "x" }) })
    expect(noFile.json().error).toBe("missing_file")

    const badField = await ctx.app.inject({
      method: "POST",
      url,
      ...multipart({ kind: "spaceship" }, { name: "a.txt", type: "text/plain", content: Buffer.from("a") }),
    })
    expect(badField.statusCode).toBe(400)
    expect(badField.json().error).toBe("validation_error")

    const tooLarge = await ctx.app.inject({
      method: "POST",
      url,
      ...multipart({}, { name: "big.bin", type: "application/octet-stream", content: Buffer.alloc(MAX_UPLOAD_BYTES + 1) }),
    })
    expect(tooLarge.statusCode).toBe(413)

    const unknownBoard = await ctx.app.inject({
      method: "POST",
      url: "/api/file-boards/missing/items",
      ...multipart({}, { name: "a.txt", type: "text/plain", content: Buffer.from("a") }),
    })
    expect(unknownBoard.statusCode).toBe(404)
  })
})
