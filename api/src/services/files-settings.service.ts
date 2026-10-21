import { constants } from "node:fs"
import { access, mkdir, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { eq } from "drizzle-orm"
import type { Db } from "../db/client"
import { appSettings, fileItems } from "../db/schema"
import { BadRequestError, HttpError } from "./errors"
import { FileStorageService } from "./file-storage.service"

const SETTINGS_ID = "default"
// Created inside the picked folder so uploads never mix with the user's own files.
export const UPLOADS_SUBDIR = join("life-board-app", "uploads")

export type FilesSettings = { baseDir: string | null; uploadsDir: string; defaultUploadsDir: string }

/** Where uploads live: the data directory by default, or a folder picked in Settings > Files. */
export class FilesSettingsService {
  private readonly defaultRoot: string

  constructor(
    private readonly db: Db,
    private readonly storage: FileStorageService,
    defaultRoot: string,
  ) {
    this.defaultRoot = resolve(defaultRoot)
  }

  /** Points the shared storage at the saved folder; runs once at startup. */
  async load() {
    this.storage.setRoot(this.uploadsDir(await this.savedBaseDir()))
  }

  async get(): Promise<FilesSettings> {
    return { baseDir: await this.savedBaseDir(), uploadsDir: this.storage.root, defaultUploadsDir: this.defaultRoot }
  }

  /** Moves every upload under `baseDir` (or back to the default for `null`), then switches to it. */
  async update(baseDir: string | null): Promise<FilesSettings> {
    const nextBase = baseDir === null ? null : await writableDir(baseDir)
    const previous = new FileStorageService(this.storage.root)
    const target = new FileStorageService(this.uploadsDir(nextBase))
    await mkdir(target.root, { recursive: true })

    const paths = target.root === previous.root ? [] : await this.storagePaths()
    await copyAll(previous, target, paths)

    const values = { uploadsBaseDir: nextBase, updatedAt: new Date() }
    await this.db
      .insert(appSettings)
      .values({ id: SETTINGS_ID, ...values })
      .onConflictDoUpdate({ target: appSettings.id, set: values })
    this.storage.setRoot(target.root)
    // Best effort: every file already lives in the new folder.
    await Promise.all(paths.map((path) => previous.remove(path).catch(() => {})))
    return this.get()
  }

  private uploadsDir(baseDir: string | null) {
    return baseDir ? join(baseDir, UPLOADS_SUBDIR) : this.defaultRoot
  }

  private async savedBaseDir() {
    const [row] = await this.db.select().from(appSettings).where(eq(appSettings.id, SETTINGS_ID))
    return row?.uploadsBaseDir ?? null
  }

  private async storagePaths() {
    const rows = await this.db.select({ storagePath: fileItems.storagePath }).from(fileItems)
    return rows.map((row) => row.storagePath)
  }
}

/** Expands a leading `~` and checks the folder exists and accepts writes. */
async function writableDir(input: string) {
  const dir = input.replace(/^~(?=$|[\\/])/, homedir())
  if (!isAbsolute(dir)) throw new BadRequestError("relative_dir", "The folder must be an absolute path.")
  try {
    if (!(await stat(dir)).isDirectory()) throw new Error("Not a directory.")
    await access(dir, constants.W_OK)
  } catch {
    throw new BadRequestError("invalid_dir", "The folder doesn't exist or isn't writable.")
  }
  return resolve(dir)
}

/** Copies every file or none: on failure, removes the copies already made. */
async function copyAll(from: FileStorageService, to: FileStorageService, paths: string[]) {
  const copied: string[] = []
  try {
    for (const path of paths) {
      try {
        await from.copyTo(path, to)
        copied.push(path)
      } catch (error) {
        // A file already missing from disk can't be moved; don't let it block the switch.
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
    }
  } catch (error) {
    await Promise.all(copied.map((path) => to.remove(path).catch(() => {})))
    throw new HttpError(500, "move_failed", (error as Error).message)
  }
}
