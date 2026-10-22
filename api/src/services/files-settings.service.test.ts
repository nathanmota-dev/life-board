import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb } from "../test/create-test-app"
import { FileBoardsService } from "./file-boards.service"
import { FileStorageService } from "./file-storage.service"
import { FilesSettingsService } from "./files-settings.service"

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  return { ...actual, access: vi.fn(actual.access) }
})

let ctx: Awaited<ReturnType<typeof createTestDb>>
let defaultRoot: string
let storage: FileStorageService
let boards: FileBoardsService
let settings: FilesSettingsService

beforeEach(async () => {
  ctx = await createTestDb()
  defaultRoot = join(ctx.dir, "uploads")
  storage = new FileStorageService(defaultRoot)
  boards = new FileBoardsService(ctx.db, storage)
  settings = new FilesSettingsService(ctx.db, storage, defaultRoot)
  await mkdir(join(ctx.dir, "apps"))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await ctx.cleanup()
})

const png = { buffer: Buffer.from("png-bytes"), filename: "photo.png", mime: "image/png" }
const pickedRoot = () => join(ctx.dir, "apps", "life-board-app", "uploads")

async function upload() {
  const board = await boards.createBoard({ name: "Photos" })
  return boards.addItem(board.id, png, {})
}

describe("FilesSettingsService", () => {
  it("defaults to the data directory", async () => {
    await settings.load()
    expect(await settings.get()).toEqual({ baseDir: null, uploadsDir: defaultRoot, defaultUploadsDir: defaultRoot })
  })

  it("moves existing uploads under <folder>/life-board-app/uploads and saves new ones there", async () => {
    const item = await upload()

    const result = await settings.update(join(ctx.dir, "apps"))

    expect(result).toEqual({ baseDir: join(ctx.dir, "apps"), uploadsDir: pickedRoot(), defaultUploadsDir: defaultRoot })
    expect(await readFile(join(pickedRoot(), item.storagePath), "utf8")).toBe("png-bytes")
    expect(await readdir(defaultRoot)).toEqual([])
    expect((await boards.openItemFile(item.id)).size).toBe(9)

    const next = await upload()
    expect(await readdir(pickedRoot())).toContain(next.storagePath)
  })

  it("keeps the picked folder across restarts and can go back to the default", async () => {
    const item = await upload()
    await settings.update(join(ctx.dir, "apps"))

    const restarted = new FileStorageService(defaultRoot)
    await new FilesSettingsService(ctx.db, restarted, defaultRoot).load()
    expect(restarted.root).toBe(pickedRoot())

    expect((await settings.update(null)).uploadsDir).toBe(defaultRoot)
    expect(await readFile(join(defaultRoot, item.storagePath), "utf8")).toBe("png-bytes")
    expect(await readdir(pickedRoot())).toEqual([])
  })

  it("leaves the files alone when the folder is unchanged", async () => {
    const item = await upload()
    const copy = vi.spyOn(FileStorageService.prototype, "copyTo")

    await settings.update(null)

    expect(copy).not.toHaveBeenCalled()
    expect(await readFile(join(defaultRoot, item.storagePath), "utf8")).toBe("png-bytes")
  })

  it("rejects relative, missing, non-directory and unwritable folders", async () => {
    await writeFile(join(ctx.dir, "file.txt"), "x")
    await mkdir(join(ctx.dir, "locked"))

    await expect(settings.update("apps")).rejects.toMatchObject({ statusCode: 400, code: "relative_dir" })
    // `~` counts as the home folder, not a relative path.
    await expect(settings.update("~/life-board-missing-folder")).rejects.toMatchObject({ code: "invalid_dir" })
    await expect(settings.update(join(ctx.dir, "missing"))).rejects.toMatchObject({ code: "invalid_dir" })
    await expect(settings.update(join(ctx.dir, "file.txt"))).rejects.toMatchObject({ code: "invalid_dir" })
    const item = await upload()
    // Directory chmod bits do not deny writes on Windows. Exercise the OS
    // permission error on every platform without depending on POSIX modes.
    vi.mocked(access).mockRejectedValueOnce(Object.assign(new Error("Permission denied"), { code: "EACCES" }))
    await expect(settings.update(join(ctx.dir, "locked"))).rejects.toMatchObject({ statusCode: 400, code: "invalid_dir" })
    expect((await settings.get()).baseDir).toBeNull()
    expect(await readFile(join(defaultRoot, item.storagePath), "utf8")).toBe("png-bytes")
    expect(await readdir(join(ctx.dir, "locked"))).toEqual([])
  })

  it("rolls back the copies and keeps the old folder when a file fails to move", async () => {
    const first = await upload()
    const second = await upload()
    const copyTo = FileStorageService.prototype.copyTo
    vi.spyOn(FileStorageService.prototype, "copyTo").mockImplementation(async function (this: FileStorageService, path, target) {
      if (path === second.storagePath) throw Object.assign(new Error("disk full"), { code: "ENOSPC" })
      return copyTo.call(this, path, target)
    })

    await expect(settings.update(join(ctx.dir, "apps"))).rejects.toMatchObject({ statusCode: 500, code: "move_failed" })

    expect(await readdir(pickedRoot())).toEqual([])
    expect(await settings.get()).toMatchObject({ baseDir: null, uploadsDir: defaultRoot })
    expect((await boards.openItemFile(first.id)).size).toBe(9)
  })

  it("skips rows whose file is already gone from disk", async () => {
    const lost = await upload()
    const kept = await upload()
    await storage.remove(lost.storagePath)

    await settings.update(join(ctx.dir, "apps"))

    expect(await readdir(pickedRoot())).toEqual([kept.storagePath])
  })
})
