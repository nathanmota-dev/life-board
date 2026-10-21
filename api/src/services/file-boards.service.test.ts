import { eq } from "drizzle-orm"
import { join } from "node:path"
import { text } from "node:stream/consumers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fileBoards, fileItems } from "../db/schema"
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
  it("creates, updates, lists and deletes boards", async () => {
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

  it("deletes a board with its item rows and files", async () => {
    const board = await service.createBoard({ name: "Trip" })
    const other = await service.createBoard({ name: "Other" })
    const first = await service.addItem(board.id, png, { title: "Beach", notes: "Sunset" })
    const second = await service.addItem(board.id, png, {})
    const kept = await service.addItem(other.id, png, {})

    await service.removeBoard(board.id)

    expect(await ctx.db.select().from(fileBoards)).toEqual([expect.objectContaining({ id: other.id })])
    expect(await ctx.db.select().from(fileItems)).toEqual([expect.objectContaining({ id: kept.id })])
    await expect(storage.size(first.storagePath)).rejects.toThrow()
    await expect(storage.size(second.storagePath)).rejects.toThrow()
    expect(await storage.size(kept.storagePath)).toBe(9)
    await expect(service.openItemFile(first.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it("removes item rows for good and clears the board cover", async () => {
    const board = await service.createBoard({ name: "Board" })
    const item = await service.addItem(board.id, png, {})
    await service.updateBoard(board.id, { coverItemId: item.id })

    await service.removeItem(item.id)

    expect(await ctx.db.select().from(fileItems)).toEqual([])
    expect((await service.listBoards())[0].coverItemId).toBeNull()
  })

  it("purges rows soft deleted by earlier versions", async () => {
    const board = await service.createBoard({ name: "Old" })
    const live = await service.createBoard({ name: "Live" })
    const orphan = await service.addItem(board.id, png, {})
    const trashed = await service.addItem(live.id, png, {})
    const kept = await service.addItem(live.id, png, {})
    await ctx.db.update(fileBoards).set({ deletedAt: new Date() }).where(eq(fileBoards.id, board.id))
    await ctx.db.update(fileItems).set({ deletedAt: new Date() }).where(eq(fileItems.id, trashed.id))

    await service.purgeDeleted()

    expect(await ctx.db.select({ id: fileBoards.id }).from(fileBoards)).toEqual([{ id: live.id }])
    expect(await ctx.db.select({ id: fileItems.id }).from(fileItems)).toEqual([{ id: kept.id }])
    await expect(storage.size(orphan.storagePath)).rejects.toThrow()
    await expect(storage.size(trashed.storagePath)).rejects.toThrow()
    expect(await storage.size(kept.storagePath)).toBe(9)
  })
})
