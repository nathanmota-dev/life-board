import { join } from "node:path"
import { text } from "node:stream/consumers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb } from "../test/create-test-app"
import { NotFoundError } from "./errors"
import { FileBoardsService } from "./file-boards.service"
import { FileStorageService } from "./file-storage.service"

let ctx: Awaited<ReturnType<typeof createTestDb>>
let storage: FileStorageService
let service: FileBoardsService

beforeEach(async () => {
  ctx = await createTestDb()
  storage = new FileStorageService(join(ctx.dir, "uploads"))
  service = new FileBoardsService(ctx.db, storage)
})
afterEach(() => ctx.cleanup())

const png = { buffer: Buffer.from("png-bytes"), filename: "photo.png", mime: "image/png" }

describe("FileBoardsService", () => {
  it("creates, updates, lists and soft deletes boards", async () => {
    const board = await service.createBoard({ name: "Receipts", kind: "receipts" })
    expect(board).toMatchObject({ color: "#06b6d4", description: null })

    expect((await service.updateBoard(board.id, { color: "#000000" })).color).toBe("#000000")
    expect(await service.listBoards()).toHaveLength(1)

    await service.removeBoard(board.id)
    expect(await service.listBoards()).toEqual([])
    await expect(service.updateBoard(board.id, { name: "x" })).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.removeBoard(board.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.listItems(board.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.addItem(board.id, png, {})).rejects.toBeInstanceOf(NotFoundError)
  })

  it("stores uploads and infers the item kind from the mime type", async () => {
    const board = await service.createBoard({ name: "Board" })

    const image = await service.addItem(board.id, png, { title: "Beach" })
    const pdf = await service.addItem(board.id, { buffer: Buffer.from("%PDF"), filename: "a.pdf", mime: "" }, {})
    const receipt = await service.addItem(board.id, png, { kind: "receipt", amountCents: 1250, currency: "BRL" })

    expect(image).toMatchObject({ kind: "image", title: "Beach", mime: "image/png", sizeBytes: 9 })
    expect(pdf).toMatchObject({ kind: "other", mime: "application/octet-stream" })
    expect(receipt).toMatchObject({ kind: "receipt", amountCents: 1250 })
    expect(await service.listItems(board.id)).toHaveLength(3)

    const opened = await service.openItemFile(image.id)
    expect(opened.size).toBe(9)
    expect(await text(opened.stream)).toBe("png-bytes")
  })

  it("updates items and deletes their files", async () => {
    const board = await service.createBoard({ name: "Board" })
    const item = await service.addItem(board.id, png, {})

    expect((await service.updateItem(item.id, { tags: ["trip"] })).tags).toEqual(["trip"])

    await service.removeItem(item.id)
    await expect(storage.size(item.storagePath)).rejects.toThrow()
    await expect(service.updateItem(item.id, { title: "x" })).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.removeItem(item.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.openItemFile(item.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it("still deletes the row when the file can't be removed, and falls back to the stored size", async () => {
    const board = await service.createBoard({ name: "Board" })
    const item = await service.addItem(board.id, png, {})
    vi.spyOn(storage, "size").mockRejectedValueOnce(new Error("disk"))
    expect((await service.openItemFile(item.id)).size).toBe(9)

    vi.spyOn(storage, "remove").mockRejectedValueOnce(new Error("disk"))
    await expect(service.removeItem(item.id)).resolves.toBeUndefined()
    expect(await service.listItems(board.id)).toEqual([])
  })
})
