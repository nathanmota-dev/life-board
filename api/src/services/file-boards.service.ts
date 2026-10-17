import { and, desc, eq, isNull } from "drizzle-orm"
import { ulid } from "ulid"
import type { Db } from "../db/client"
import { fileBoards, fileItems, type FileBoard, type FileItem } from "../db/schema"
import type { CreateBoardBody, UpdateBoardBody, UpdateItemBody, UploadItemFields } from "../dto/file-boards.dto"
import { NotFoundError } from "./errors"
import type { FileStorageService } from "./file-storage.service"

export type UploadedFile = { buffer: Buffer; filename: string; mime: string }

export class FileBoardsService {
  constructor(
    private readonly db: Db,
    private readonly storage: FileStorageService,
  ) {}

  listBoards() {
    return this.db.select().from(fileBoards).where(isNull(fileBoards.deletedAt)).orderBy(desc(fileBoards.updatedAt))
  }

  async createBoard(input: CreateBoardBody): Promise<FileBoard> {
    const [row] = await this.db.insert(fileBoards).values({ id: ulid(), ...input }).returning()
    return row
  }

  async updateBoard(id: string, input: UpdateBoardBody): Promise<FileBoard> {
    const [row] = await this.db
      .update(fileBoards)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(fileBoards.id, id), isNull(fileBoards.deletedAt)))
      .returning()
    if (!row) throw new NotFoundError("Board not found.")
    return row
  }

  async removeBoard(id: string) {
    const [row] = await this.db
      .update(fileBoards)
      .set({ deletedAt: new Date() })
      .where(and(eq(fileBoards.id, id), isNull(fileBoards.deletedAt)))
      .returning({ id: fileBoards.id })
    if (!row) throw new NotFoundError("Board not found.")
  }

  async listItems(boardId: string) {
    await this.findBoard(boardId)
    return this.db
      .select()
      .from(fileItems)
      .where(and(eq(fileItems.boardId, boardId), isNull(fileItems.deletedAt)))
      .orderBy(desc(fileItems.createdAt))
  }

  async addItem(boardId: string, file: UploadedFile, fields: UploadItemFields): Promise<FileItem> {
    await this.findBoard(boardId)
    const blob = await this.storage.save(file.buffer, file.filename)
    const [row] = await this.db
      .insert(fileItems)
      .values({
        id: ulid(),
        boardId,
        ...fields,
        kind: fields.kind ?? (file.mime.startsWith("image/") ? "image" : "other"),
        mime: file.mime || "application/octet-stream",
        sizeBytes: blob.sizeBytes,
        storagePath: blob.storagePath,
      })
      .returning()
    return row
  }

  async updateItem(id: string, input: UpdateItemBody): Promise<FileItem> {
    const [row] = await this.db
      .update(fileItems)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(fileItems.id, id), isNull(fileItems.deletedAt)))
      .returning()
    if (!row) throw new NotFoundError("File not found.")
    return row
  }

  async removeItem(id: string) {
    const [row] = await this.db
      .update(fileItems)
      .set({ deletedAt: new Date() })
      .where(and(eq(fileItems.id, id), isNull(fileItems.deletedAt)))
      .returning()
    if (!row) throw new NotFoundError("File not found.")
    // Best effort: the row is already gone for the user even if the disk delete fails.
    await this.storage.remove(row.storagePath).catch(() => {})
  }

  async openItemFile(id: string) {
    const [item] = await this.db
      .select()
      .from(fileItems)
      .where(and(eq(fileItems.id, id), isNull(fileItems.deletedAt)))
    if (!item) throw new NotFoundError("File not found.")
    const size = await this.storage.size(item.storagePath).catch(() => item.sizeBytes)
    return { item, size, stream: this.storage.stream(item.storagePath) }
  }

  private async findBoard(id: string) {
    const [board] = await this.db
      .select({ id: fileBoards.id })
      .from(fileBoards)
      .where(and(eq(fileBoards.id, id), isNull(fileBoards.deletedAt)))
    if (!board) throw new NotFoundError("Board not found.")
    return board
  }
}
