import { EventEmitter } from "node:events"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ handle: vi.fn(), removeHandler: vi.fn(), createUpdateDriver: vi.fn(), preserve: vi.fn(), cancel: vi.fn(), notify: vi.fn() }))
const app = Object.assign(new EventEmitter(), { isPackaged: true, getVersion: () => "1.0.0", getPath: () => directory, relaunch: vi.fn(), quit: vi.fn() })
const sender = { mainFrame: {} }
const event = { sender, senderFrame: sender.mainFrame }
const window = { isDestroyed: () => false, webContents: { send: vi.fn() } }
vi.mock("electron", () => ({ app, ipcMain: { handle: mocks.handle, removeHandler: mocks.removeHandler },
  BrowserWindow: { getAllWindows: () => [window], fromWebContents: (value: unknown) => value === sender ? window : null } }))
vi.mock("./update-driver", () => ({ createUpdateDriver: mocks.createUpdateDriver }))
vi.mock("./pomodoro", () => ({ preservePomodoroForUpdate: mocks.preserve, cancelPomodoroUpdate: mocks.cancel }))
vi.mock("./locale", () => ({ t: (key: string) => key }))
vi.mock("./notifications", () => ({ showNotification: mocks.notify }))
let directory: string
const driver = { check: vi.fn(), download: vi.fn(), install: vi.fn(), dispose: vi.fn() }
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers()
  directory = mkdtempSync(join(tmpdir(), "life-board-register-updates-"))
  // Linux is the baseline fixture; native platform cases override it below.
  vi.stubGlobal("process", { ...process, platform: "linux", arch: "x64", resourcesPath: directory })
  app.isPackaged = true
  vi.stubEnv("APPIMAGE", "/stable/life-board.AppImage")
  mocks.createUpdateDriver.mockReturnValue(driver)
  driver.check.mockResolvedValue({ version: "1.1.0", notes: null, releaseDate: null, url: "https://github.com/nathanmota-dev/life-board/releases/tag/v1.1.0" })
})
afterEach(() => {
  app.emit("will-quit"); app.removeAllListeners(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals()
  rmSync(directory, { recursive: true, force: true })
})

describe("updater main wiring", () => {
  it("registers parameterless actions, validates senders and disposes handlers on quit", async () => {
    const { registerUpdates } = await import("./register-updates")
    registerUpdates()
    const handlers = Object.fromEntries(mocks.handle.mock.calls)
    expect(Object.keys(handlers)).toEqual(["updates:get-state", "updates:check", "updates:download", "updates:install"])
    expect(() => handlers["updates:install"]({ sender: {}, senderFrame: {} })).toThrow("Untrusted")
    expect(() => handlers["updates:check"]({ sender, senderFrame: {} })).toThrow("Untrusted")
    await handlers["updates:check"](event)
    expect(window.webContents.send).toHaveBeenCalledWith("updates:state", expect.objectContaining({ status: "available" }))
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ route: "/settings?tab=updates" }))
    expect(app.relaunch).not.toHaveBeenCalled()
    app.emit("will-quit")
    expect(mocks.removeHandler).toHaveBeenCalledTimes(4)
    expect(driver.dispose).toHaveBeenCalledOnce()
  })

  it.each([
    ["win32", "x64", "nsis"], ["darwin", "x64", "mac"], ["darwin", "arm64", "mac"],
    ["win32", "arm64", null], ["win32", "ia32", null], ["freebsd", "x64", null],
  ] as const)("detects installed %s %s as %s", async (platform, arch, format) => {
    const resourcesPath = join(directory, "Life Board.app/Contents/Resources")
    mkdirSync(resourcesPath, { recursive: true })
    writeFileSync(join(resourcesPath, "app-update.yml"), "provider: github")
    writeFileSync(join(directory, "Uninstall Life Board.exe"), "")
    vi.stubGlobal("process", { ...process, platform, arch, resourcesPath, execPath: join(directory, "Life Board.exe") })
    const { installedFormat, registerUpdates } = await import("./register-updates")
    expect(installedFormat()).toBe(format)
    const updates = registerUpdates()
    expect(updates.getState().format).toBe(format)
    expect(mocks.createUpdateDriver).toHaveBeenCalledTimes(format ? 1 : 0)
  })

  it.each(["development", "portable", "store", "unpacked"])("disables %s Windows builds", async (kind) => {
    writeFileSync(join(directory, "app-update.yml"), "provider: github")
    if (kind !== "unpacked") writeFileSync(join(directory, "Uninstall Life Board.exe"), "")
    app.isPackaged = kind !== "development"
    if (kind === "portable") vi.stubEnv("PORTABLE_EXECUTABLE_DIR", directory)
    vi.stubGlobal("process", { ...process, platform: "win32", arch: "x64", windowsStore: kind === "store",
      resourcesPath: directory, execPath: join(directory, "Life Board.exe") })
    const { installedFormat } = await import("./register-updates")
    expect(installedFormat()).toBeNull()
  })

  it("disables store apps and apps without a packaged macOS feed", async () => {
    const resourcesPath = join(directory, "Life Board.app/Contents/Resources")
    mkdirSync(resourcesPath, { recursive: true })
    vi.stubGlobal("process", { ...process, platform: "darwin", arch: "arm64", resourcesPath })
    const { installedFormat } = await import("./register-updates")
    expect(installedFormat()).toBeNull()
    writeFileSync(join(resourcesPath, "app-update.yml"), "provider: github")
    vi.stubGlobal("process", { ...process, mas: true })
    expect(installedFormat()).toBeNull()
  })

  it.each(["SNAP", "FLATPAK_ID"])("keeps %s packages unavailable", async (variable) => {
    vi.stubEnv(variable, "test")
    const { installedFormat } = await import("./register-updates")
    expect(installedFormat()).toBeNull()
  })

  it("detects the Linux DEB package-type without changing the legacy contract", async () => {
    vi.stubEnv("APPIMAGE", "")
    vi.stubGlobal("process", { ...process, resourcesPath: directory })
    const { installedFormat } = await import("./register-updates")
    expect(installedFormat()).toBeNull()
    writeFileSync(join(directory, "package-type"), "deb\n")
    expect(installedFormat()).toBe("deb")
    writeFileSync(join(directory, "package-type"), "rpm\n")
    expect(installedFormat()).toBeNull()
  })
  it("preserves the timer then relaunches exactly once through the normal quit lifecycle", async () => {
    const { registerUpdates } = await import("./register-updates")
    registerUpdates()
    const lifecycle = mocks.createUpdateDriver.mock.calls[0][2]
    lifecycle.prepare()
    lifecycle.restart("/stable/life-board.AppImage")
    expect(mocks.preserve).toHaveBeenCalledOnce()
    expect(app.relaunch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ execPath: "/stable/life-board.AppImage" }))
    expect(app.quit).toHaveBeenCalledOnce()
    expect(mocks.preserve.mock.invocationCallOrder[0]).toBeLessThan(app.quit.mock.invocationCallOrder[0])
  })
})
