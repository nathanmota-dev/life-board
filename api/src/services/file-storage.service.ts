import { createReadStream } from "node:fs"
import { mkdir, stat, unlink, writeFile } from "node:fs/promises"
import { basename, extname, resolve, sep } from "node:path"
import { ulid } from "ulid"

export type SavedBlob = { storagePath: string; sizeBytes: number }

/** Uploaded files on local disk. `storagePath` values are relative to the root. */
export class FileStorageService {
  private readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  async save(buffer: Buffer, originalName: string): Promise<SavedBlob> {
    const ext = extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 8)
    const base = basename(originalName, extname(originalName)).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100)
    const storagePath = `${ulid()}-${base || "upload"}${ext}`
    const fullPath = this.resolve(storagePath)
    await mkdir(this.root, { recursive: true })
    await writeFile(fullPath, buffer)
    return { storagePath, sizeBytes: buffer.byteLength }
  }

  async size(storagePath: string) {
    return (await stat(this.resolve(storagePath))).size
  }

  stream(storagePath: string) {
    return createReadStream(this.resolve(storagePath))
  }

  async remove(storagePath: string) {
    try {
      await unlink(this.resolve(storagePath))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }

  /** Refuses any path that would land outside the storage root. */
  private resolve(storagePath: string) {
    const fullPath = resolve(this.root, storagePath)
    if (!fullPath.startsWith(this.root + sep)) throw new Error("Invalid storage path.")
    return fullPath
  }
}
