import { createHash } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AppUpdater } from "electron-updater"
import { BaseUpdater } from "electron-updater/out/BaseUpdater"
import { MacUpdateAdapter } from "./update-driver-macos"
import { WindowsUpdateAdapter } from "./update-driver-windows"
import { AppUpdates } from "./app-updates"
import { createUpdateDriver } from "./update-driver"
import type { UpdateLifecycle } from "./update-driver"
import { emptyHistory, updateError } from "./update-state"

const { native, app } = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events")
  return {
    native: Object.assign(new EventEmitter(), { checkForUpdates: vi.fn(), quitAndInstall: vi.fn() }),
    app: Object.assign(new EventEmitter(), { getVersion: () => "1.0.0", getName: () => "life-board-app", getPath: () => "/unused",
      isPackaged: true, runningUnderARM64Translation: false, quit: vi.fn(), relaunch: vi.fn() }),
  }
})
vi.mock("electron", () => ({ app, autoUpdater: native }))
const require = createRequire(import.meta.url)
const electronPath = require.resolve("electron")
const originalElectron = require(electronPath)

let directory: string
let payload: string
let lifecycle: UpdateLifecycle
let current: AppUpdater
let service: AppUpdates | undefined
let release: ReturnType<typeof info>
const launcher = BaseUpdater.prototype as unknown as { spawnLog: (command: string, args?: string[]) => Promise<boolean> }
const digest = (content: string) => createHash("sha512").update(content).digest("base64")
function info(format: "nsis" | "mac", arch = "x64") {
  return { version: "1.1.0", path: "unused", sha512: digest("payload"), releaseDate: "2026-10-21",
    files: [{ url: `life-board-1.1.0-${format === "mac" ? "mac" : "win"}-${arch}.${format === "mac" ? "zip" : "exe"}`, sha512: digest("payload") }] }
}

function create(format: "nsis" | "mac", arch = "x64") {
  vi.stubGlobal("process", { ...process, platform: format === "mac" ? "darwin" : "win32", arch })
  release = info(format, arch)
  const driver = createUpdateDriver(format, "1.0.0", lifecycle)
  service = new AppUpdates({ installedVersion: "1.0.0", format, driver,
    store: { load: emptyHistory, save: vi.fn() }, broadcast: vi.fn(), notify: vi.fn() })
  return { driver, updates: service }
}

beforeEach(() => {
  // electron-updater uses CommonJS require, outside Vitest's ESM mock loader.
  require.cache[electronPath]!.exports = { app, autoUpdater: native }
  vi.clearAllMocks()
  vi.useFakeTimers()
  directory = mkdtempSync(join(tmpdir(), "life-board-native-update-"))
  payload = join(directory, "cached-payload")
  writeFileSync(payload, "payload")
  lifecycle = { prepare: vi.fn(), cancel: vi.fn(), restart: vi.fn() }
  app.runningUnderARM64Translation = false
  native.checkForUpdates.mockReset()
  app.quit.mockImplementation(() => { app.emit("will-quit") })
  native.quitAndInstall.mockReset().mockImplementation(() => {
    native.emit("before-quit-for-update")
    app.emit("will-quit")
  })
  vi.spyOn(AppUpdater.prototype, "checkForUpdates").mockImplementation(async function (this: AppUpdater) {
    current = this
    this.logger = null
    return { updateInfo: release, versionInfo: release, isUpdateAvailable: true }
  })
  vi.spyOn(AppUpdater.prototype, "downloadUpdate").mockImplementation(async function (this: AppUpdater) {
    Object.assign(this, { downloadedUpdateHelper: {
      file: payload, packageFile: null, downloadedFileInfo: { isAdminRightsRequired: false },
    } })
    this.emit("download-progress", { percent: 45, total: 100, transferred: 45, delta: 45, bytesPerSecond: 45 })
    // Native contracts need not return a single payload path.
    return []
  })
  vi.spyOn(launcher, "spawnLog").mockResolvedValue(true)
})
afterEach(() => {
  service?.dispose()
  service = undefined
  native.removeAllListeners()
  app.removeAllListeners()
  require.cache[electronPath]!.exports = originalElectron
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllTimers()
  vi.useRealTimers()
  rmSync(directory, { force: true, recursive: true })
})

describe("native updater contracts", () => {
  it.each(["nsis", "mac"] as const)("does not offer or download %s updates blocked by native compatibility", async (format) => {
    const { driver, updates } = create(format)
    vi.mocked(AppUpdater.prototype.checkForUpdates).mockResolvedValue({ updateInfo: release, versionInfo: release, isUpdateAvailable: false })
    await updates.check()
    expect(updates.getState()).toMatchObject({ status: "up-to-date", release: null })
    await expect(driver.download("1.1.0", vi.fn())).rejects.toMatchObject({ kind: "metadata" })
    expect(AppUpdater.prototype.downloadUpdate).not.toHaveBeenCalled()
  })

  it.each(["nsis", "mac"] as const)("keeps %s check/download/ordinary quit free of installation", async (format) => {
    const { updates } = create(format)
    await updates.check()
    expect(current).toBeInstanceOf(format === "mac" ? MacUpdateAdapter : WindowsUpdateAdapter)
    expect(current).toMatchObject({ autoDownload: false, autoInstallOnAppQuit: false, allowPrerelease: false, allowDowngrade: false, channel: "latest" })
    await updates.download()
    expect(updates.getState()).toMatchObject({ status: "ready", progress: 100 })
    expect(native.checkForUpdates).not.toHaveBeenCalled()
    expect(native.quitAndInstall).not.toHaveBeenCalled()
    expect(lifecycle.prepare).not.toHaveBeenCalled()
    updates.dispose()
    expect(lifecycle.restart).not.toHaveBeenCalled()
    expect(current.listenerCount("download-progress")).toBe(0)
  })

  it("waits for native macOS signature staging, preserves state and restarts exactly once", async () => {
    const { updates } = create("mac", "arm64")
    await updates.check()
    await updates.download()
    const installing = updates.install()
    await vi.waitFor(() => expect(native.checkForUpdates).toHaveBeenCalledOnce())
    expect(lifecycle.prepare).not.toHaveBeenCalled()
    expect(updates.install()).toBe(installing)
    native.emit("update-downloaded")
    await installing
    expect(lifecycle.prepare).toHaveBeenCalledOnce()
    expect(native.quitAndInstall).toHaveBeenCalledOnce()
    expect(lifecycle.restart).not.toHaveBeenCalled()
    native.emit("update-downloaded")
    expect(native.quitAndInstall).toHaveBeenCalledOnce()
    expect(native.listenerCount("before-quit-for-update")).toBe(0)
    // The MacUpdater's internal listener is still registered.
    expect(native.listenerCount("update-downloaded")).toBe(1)
  })

  it("handles late macOS signature errors, then retries without latent quit callbacks", async () => {
    const { updates } = create("mac")
    await updates.check()
    await updates.download()
    const installing = updates.install()
    await vi.waitFor(() => expect(native.checkForUpdates).toHaveBeenCalledOnce())
    native.emit("error", new Error("ERR_UPDATER_INVALID_SIGNATURE"))
    await installing
    expect(updates.getState()).toMatchObject({ status: "error", error: "integrity", retryAction: "download" })
    expect(native.quitAndInstall).not.toHaveBeenCalled()
    expect(native.listenerCount("update-downloaded")).toBe(1)
    await updates.download()
    const retry = updates.install()
    await vi.waitFor(() => expect(native.checkForUpdates).toHaveBeenCalledTimes(2))
    native.emit("update-downloaded")
    await retry
    expect(native.quitAndInstall).toHaveBeenCalledOnce()
  })

  it("times out macOS staging, cleans listeners and permits a new install attempt", async () => {
    const { updates } = create("mac")
    await updates.check()
    await updates.download()
    const installing = updates.install()
    await vi.waitFor(() => expect(native.checkForUpdates).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(120_000)
    await installing
    expect(updates.getState()).toMatchObject({ status: "error", error: "installation", retryAction: "install" })
    expect(native.listenerCount("update-downloaded")).toBe(1)
    native.emit("update-downloaded")
    expect(native.quitAndInstall).not.toHaveBeenCalled()
    const retry = updates.install()
    await vi.waitFor(() => expect(native.checkForUpdates).toHaveBeenCalledTimes(2))
    native.emit("update-downloaded")
    await retry
    expect(native.quitAndInstall).toHaveBeenCalledOnce()
  })

  it("cancels staging on shutdown and ignores late native completion", async () => {
    const { updates } = create("mac")
    await updates.check()
    await updates.download()
    const installing = updates.install()
    await vi.waitFor(() => expect(native.checkForUpdates).toHaveBeenCalledOnce())
    updates.dispose()
    await installing
    native.emit("update-downloaded")
    expect(native.quitAndInstall).not.toHaveBeenCalled()
    expect(native.listenerCount("update-downloaded")).toBe(1)
  })

  it("uses NSIS's installer launch with force-run and never schedules app.relaunch", async () => {
    const { updates } = create("nsis")
    await updates.check()
    await updates.download()
    await updates.install()
    expect(lifecycle.prepare).toHaveBeenCalledOnce()
    expect(launcher.spawnLog).toHaveBeenCalledWith(payload, ["--updated", "--force-run"], undefined, undefined)
    expect(app.quit).toHaveBeenCalledOnce()
    expect(lifecycle.restart).not.toHaveBeenCalled()
    expect(app.relaunch).not.toHaveBeenCalled()
  })

  it("keeps Windows open after asynchronous launch cancellation and permits retry", async () => {
    vi.mocked(launcher.spawnLog).mockRejectedValueOnce(new Error("authorization cancelled"))
    const { updates } = create("nsis")
    await updates.check()
    await updates.download()
    await updates.install()
    expect(updates.getState()).toMatchObject({ status: "error", error: "permission", retryAction: "install" })
    expect(lifecycle.cancel).toHaveBeenCalledOnce()
    expect(app.quit).not.toHaveBeenCalled()
    await updates.install()
    expect(app.quit).toHaveBeenCalledOnce()
    expect(lifecycle.prepare).toHaveBeenCalledTimes(2)
  })

  it("ignores an old Windows launch completing after timeout while retrying", async () => {
    let first!: (value: boolean) => void
    let second!: (value: boolean) => void
    vi.mocked(launcher.spawnLog)
      .mockReturnValueOnce(new Promise((resolve) => { first = resolve }))
      .mockReturnValueOnce(new Promise((resolve) => { second = resolve }))
    const { updates } = create("nsis")
    await updates.check()
    await updates.download()
    const installing = updates.install()
    await vi.waitFor(() => expect(launcher.spawnLog).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(120_000)
    await installing
    expect(updates.getState()).toMatchObject({ status: "error", error: "installation", retryAction: "install" })
    const retry = updates.install()
    await vi.waitFor(() => expect(launcher.spawnLog).toHaveBeenCalledTimes(2))
    first(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(app.quit).not.toHaveBeenCalled()
    second(true)
    await retry
    expect(app.quit).toHaveBeenCalledOnce()
  })

  it("captures asynchronous errors after native quitAndInstall returns", async () => {
    const { updates } = create("mac")
    native.checkForUpdates.mockImplementation(() => native.emit("update-downloaded"))
    native.quitAndInstall.mockImplementation(() => {})
    await updates.check()
    await updates.download()
    const installing = updates.install()
    await vi.waitFor(() => expect(native.quitAndInstall).toHaveBeenCalledOnce())
    native.emit("error", new Error("authorization cancelled"))
    await installing
    expect(updates.getState()).toMatchObject({ status: "error", error: "permission", retryAction: "install" })
    expect(lifecycle.cancel).toHaveBeenCalledOnce()
    expect(app.listenerCount("will-quit")).toBe(0)
    native.quitAndInstall.mockImplementation(() => { app.emit("will-quit") })
    await updates.install()
    expect(native.quitAndInstall).toHaveBeenCalledTimes(2)
    expect(native.checkForUpdates).toHaveBeenCalledOnce()
  })

  it("does not erase the snapshot when normal will-quit cleanup disposes the driver", async () => {
    const { updates } = create("nsis")
    app.once("will-quit", () => updates.dispose())
    await updates.check()
    await updates.download()
    await updates.install()
    expect(lifecycle.prepare).toHaveBeenCalledOnce()
    expect(lifecycle.cancel).not.toHaveBeenCalled()
  })

  it("verifies auxiliary payloads from native cache regardless of returned path order", async () => {
    const auxiliary = join(directory, "package.7z")
    writeFileSync(auxiliary, "auxiliary")
    vi.mocked(AppUpdater.prototype.downloadUpdate).mockImplementation(async function (this: AppUpdater) {
      Object.assign(this, { downloadedUpdateHelper: { file: payload, packageFile: auxiliary } })
      return [auxiliary, payload]
    })
    const { updates } = create("nsis")
    Object.assign(release, { packages: { x64: { path: "package-x64.7z", sha512: digest("auxiliary") } } })
    await updates.check()
    await updates.download()
    expect(updates.getState().status).toBe("ready")
    writeFileSync(auxiliary, "tampered")
    await updates.install()
    expect(updates.getState()).toMatchObject({ status: "error", error: "integrity", retryAction: "download" })
    expect(app.quit).not.toHaveBeenCalled()
  })

  it("cancels downloads on disposal, removes progress listeners and permits network retry", async () => {
    vi.mocked(AppUpdater.prototype.downloadUpdate).mockImplementationOnce(async (token) => {
      return token!.createPromise((_resolve, _reject) => {})
    })
    const { driver, updates } = create("nsis")
    await updates.check()
    const downloading = driver.download("1.1.0", vi.fn())
    const rejection = expect(downloading).rejects.toThrow()
    expect(current.listenerCount("download-progress")).toBe(1)
    driver.dispose()
    await rejection
    expect(current.listenerCount("download-progress")).toBe(0)
  })

  it.each(["nsis", "mac"] as const)("rechecks %s cached payload integrity before installation", async (format) => {
    const { updates } = create(format)
    await updates.check()
    await updates.download()
    writeFileSync(payload, "tampered")
    await updates.install()
    expect(updates.getState()).toMatchObject({ status: "error", error: "integrity", retryAction: "download" })
    expect(native.checkForUpdates).not.toHaveBeenCalled()
    expect(lifecycle.prepare).not.toHaveBeenCalled()
    expect(app.quit).not.toHaveBeenCalled()
  })

  it.each(["x64", "arm64"])("selects the Mac architecture %s, including hardware under Rosetta", async (arch) => {
    const { updates } = create("mac", "x64")
    // A second adapter can observe the Electron-provided hardware translation flag.
    app.runningUnderARM64Translation = arch === "arm64"
    const adapter = new MacUpdateAdapter()
    expect(adapter.updateArch).toBe(arch)
    await updates.check()
  })

  it.each(["ERR_UPDATER_INVALID_SIGNATURE", "Code signature at URL did not pass validation"])("classifies %s as integrity", (message) => {
    expect(updateError(new Error(message))).toBe("integrity")
  })
})
