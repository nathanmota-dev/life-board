import { EventEmitter } from "node:events"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ handle: vi.fn(), removeHandler: vi.fn(), createUpdateDriver: vi.fn(), preserve: vi.fn(), notify: vi.fn() }))
const app = Object.assign(new EventEmitter(), { isPackaged: true, getVersion: () => "1.0.0", getPath: () => directory, relaunch: vi.fn(), quit: vi.fn() })
const sender = { mainFrame: {} }
const event = { sender, senderFrame: sender.mainFrame }
const window = { isDestroyed: () => false, webContents: { send: vi.fn() } }
vi.mock("electron", () => ({ app, ipcMain: { handle: mocks.handle, removeHandler: mocks.removeHandler },
  BrowserWindow: { getAllWindows: () => [window], fromWebContents: (value: unknown) => value === sender ? window : null } }))
vi.mock("./update-driver", () => ({ createUpdateDriver: mocks.createUpdateDriver }))
vi.mock("./pomodoro", () => ({ preservePomodoroForUpdate: mocks.preserve }))
vi.mock("./locale", () => ({ t: (key: string) => key }))
vi.mock("./notifications", () => ({ showNotification: mocks.notify }))
let directory: string
const driver = { check: vi.fn(), download: vi.fn(), install: vi.fn(), dispose: vi.fn() }
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers()
  directory = mkdtempSync(join(tmpdir(), "life-board-register-updates-"))
  vi.stubEnv("APPIMAGE", "/stable/life-board.AppImage")
  mocks.createUpdateDriver.mockReturnValue(driver)
  driver.check.mockResolvedValue({ version: "1.1.0", notes: null, releaseDate: null, url: "https://github.com/nathanmota-dev/life-board/releases/tag/v1.1.0" })
})
afterEach(() => {
  app.emit("will-quit"); app.removeAllListeners(); vi.useRealTimers(); vi.unstubAllEnvs()
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
  it("preserves the timer then relaunches exactly once through the normal quit lifecycle", async () => {
    const { registerUpdates } = await import("./register-updates")
    registerUpdates()
    const restart = mocks.createUpdateDriver.mock.calls[0][2]
    restart("/stable/life-board.AppImage")
    expect(mocks.preserve).toHaveBeenCalledOnce()
    expect(app.relaunch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ execPath: "/stable/life-board.AppImage" }))
    expect(app.quit).toHaveBeenCalledOnce()
    expect(mocks.preserve.mock.invocationCallOrder[0]).toBeLessThan(app.quit.mock.invocationCallOrder[0])
  })
})
