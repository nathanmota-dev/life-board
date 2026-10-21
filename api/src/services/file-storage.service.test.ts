import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { text } from "node:stream/consumers"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { FileStorageService } from "./file-storage.service"

let dir: string
let storage: FileStorageService

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "life-board-files-"))
  storage = new FileStorageService(join(dir, "uploads"))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe("FileStorageService", () => {
  it("saves, measures, streams and removes files", async () => {
    const blob = await storage.save(Buffer.from("hello"), "My Receipt (1).PNG")

    expect(blob.sizeBytes).toBe(5)
    expect(blob.storagePath).toMatch(/^\w{26}-My_Receipt__1_\.png$/)
    expect(await readFile(join(dir, "uploads", blob.storagePath), "utf8")).toBe("hello")
    expect(await storage.size(blob.storagePath)).toBe(5)
    expect(await text(storage.stream(blob.storagePath))).toBe("hello")

    await storage.remove(blob.storagePath)
    await expect(storage.size(blob.storagePath)).rejects.toThrow()
    // Removing a file that's already gone is fine.
    await expect(storage.remove(blob.storagePath)).resolves.toBeUndefined()
  })

  it("switches roots and copies files to another storage", async () => {
    const blob = await storage.save(Buffer.from("hello"), "a.txt")
    const target = new FileStorageService(join(dir, "other", "uploads"))

    await storage.copyTo(blob.storagePath, target)
    expect(await readFile(join(dir, "other", "uploads", blob.storagePath), "utf8")).toBe("hello")
    expect(await storage.size(blob.storagePath)).toBe(5)

    storage.setRoot(join(dir, "other", "uploads"))
    expect(storage.root).toBe(join(dir, "other", "uploads"))
    const next = await storage.save(Buffer.from("x"), "b.txt")
    expect(await readFile(join(dir, "other", "uploads", next.storagePath), "utf8")).toBe("x")
  })

  it("sanitizes hostile names and falls back when nothing is left", async () => {
    const blob = await storage.save(Buffer.from("x"), "../../etc/passwd")
    expect(blob.storagePath).toMatch(/^\w{26}-passwd$/)

    const unnamed = await storage.save(Buffer.from("x"), "")
    expect(unnamed.storagePath).toMatch(/^\w{26}-upload$/)
  })

  it("refuses storage paths outside the root", async () => {
    await expect(storage.size("../secret.key")).rejects.toThrow("Invalid storage path.")
    expect(() => storage.stream("/etc/passwd")).toThrow("Invalid storage path.")
    await expect(storage.remove("..")).rejects.toThrow("Invalid storage path.")
  })

  it("works under a profile path with spaces, non-ASCII and URL syntax", async () => {
    const root = join(dir, "Usuário Ç #1 %20", "uploads")
    const profile = new FileStorageService(root)
    const blob = await profile.save(Buffer.from("olá"), "Recibo de março.pdf")

    expect(await readFile(join(root, blob.storagePath), "utf8")).toBe("olá")
    expect(await text(profile.stream(blob.storagePath))).toBe("olá")
    await profile.remove(blob.storagePath)
    await expect(profile.size(blob.storagePath)).rejects.toThrow()
  })

  it("rethrows unexpected errors when removing", async () => {
    const blob = await storage.save(Buffer.from("x"), "a.txt")
    // Removing the uploads directory itself as a file fails with EISDIR/EPERM, not ENOENT.
    await expect(storage.remove(`${blob.storagePath}/..`)).rejects.toThrow()
  })
})
