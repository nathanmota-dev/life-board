import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createDb, sqliteFileUrl } from "./client"
import { migrationsFolder } from "../test/create-test-app"

// `?` is valid in POSIX folder names only; the other names exist on every OS.
const folders = ["com espaço", "não-ascii ç日本", "C# projetos", "100%20 off", "50% off", "a&b=c;d"]
if (process.platform !== "win32") folders.push("what?")

describe("sqliteFileUrl", () => {
  it.each(folders)("opens the database exactly at %s", async (folder) => {
    const root = await mkdtemp(join(tmpdir(), "life-board-url-"))
    const dir = join(root, folder)
    await mkdir(dir)
    const database = await createDb(sqliteFileUrl(join(dir, "life-board.db")), migrationsFolder)
    try {
      expect(await readdir(root)).toEqual([folder])
      expect(await readdir(dir)).toContain("life-board.db")
    } finally {
      database.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 15_000)

  // libsql reads `file:<path>?<query>#<fragment>`, percent-decodes the path and
  // treats a leading `//` as an authority. None of that may appear unencoded.
  it.each([
    "C:\\Users\\João Ninguém\\AppData\\Roaming\\life-board-app\\life-board.db",
    "D:\\C# 100%\\life-board.db",
    "\\\\server\\share\\life-board.db",
    "//home/user/.config/life-board-app/life-board.db",
    "/Users/me/Library/Application Support/life-board-app/life-board.db",
  ])("keeps %s intact for libsql", (path) => {
    const url = sqliteFileUrl(path)
    expect(url).toMatch(/^file:[^/?#]+$/)
    expect(decodeURIComponent(url.slice("file:".length))).toBe(path)
  })
})
