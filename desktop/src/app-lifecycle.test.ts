import { EventEmitter } from "node:events"
import type { BrowserWindow } from "electron"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ quit: vi.fn(), keepInBackground: vi.fn(), isPomodoroActive: vi.fn() }))
const app = new EventEmitter()
vi.mock("electron", () => ({ app: Object.assign(app, { quit: mocks.quit }) }))
vi.mock("./pomodoro", () => ({ isPomodoroActive: mocks.isPomodoroActive }))
vi.mock("./startup-settings", () => ({ keepInBackground: mocks.keepInBackground }))

beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })
afterEach(() => { app.removeAllListeners(); vi.unstubAllGlobals() })

describe("main window lifecycle", () => {
  it.each([
    [false, "idle", "quit"], [false, "running", "hide"], [false, "paused", "hide"],
    [true, "idle", "destroy"], [true, "running", "hide"], [true, "paused", "hide"],
  ] as const)("background=%s, pomodoro=%s closes with %s", async (background, status, outcome) => {
    mocks.keepInBackground.mockReturnValue(background)
    mocks.isPomodoroActive.mockReturnValue(status !== "idle")
    const { registerAppLifecycle, trackMainWindowClose } = await import("./app-lifecycle")
    registerAppLifecycle()
    const window = Object.assign(new EventEmitter(), { hide: vi.fn() })
    trackMainWindowClose(window as unknown as BrowserWindow)
    const event = { preventDefault: vi.fn() }
    window.emit("close", event)
    expect(event.preventDefault).toHaveBeenCalledTimes(outcome === "destroy" ? 0 : 1)
    expect(window.hide).toHaveBeenCalledTimes(outcome === "hide" ? 1 : 0)
    expect(mocks.quit).toHaveBeenCalledTimes(outcome === "quit" ? 1 : 0)
  })

  it.each(["linux", "darwin", "win32"])("quits after all windows close on %s without background work", async (platform) => {
    vi.stubGlobal("process", { ...process, platform })
    mocks.keepInBackground.mockReturnValue(false)
    mocks.isPomodoroActive.mockReturnValue(false)
    const { registerAppLifecycle } = await import("./app-lifecycle")
    registerAppLifecycle()
    app.emit("window-all-closed")
    expect(mocks.quit).toHaveBeenCalledOnce()
  })

  it.each([[true, false], [false, true], [true, true]])("stays alive with no windows for background=%s, pomodoro=%s", async (background, active) => {
    mocks.keepInBackground.mockReturnValue(background)
    mocks.isPomodoroActive.mockReturnValue(active)
    const { registerAppLifecycle } = await import("./app-lifecycle")
    registerAppLifecycle()
    app.emit("window-all-closed")
    expect(mocks.quit).not.toHaveBeenCalled()
  })

  it("allows tray Quit to close a window even with background mode and an active pomodoro", async () => {
    mocks.keepInBackground.mockReturnValue(true)
    mocks.isPomodoroActive.mockReturnValue(true)
    const { registerAppLifecycle, trackMainWindowClose } = await import("./app-lifecycle")
    registerAppLifecycle()
    const window = Object.assign(new EventEmitter(), { hide: vi.fn() })
    trackMainWindowClose(window as unknown as BrowserWindow)
    app.emit("before-quit")
    const event = { preventDefault: vi.fn() }
    window.emit("close", event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(window.hide).not.toHaveBeenCalled()
  })

  it("allows native updater window closure before before-quit and restores it on failure", async () => {
    mocks.keepInBackground.mockReturnValue(true)
    mocks.isPomodoroActive.mockReturnValue(true)
    const { registerAppLifecycle, trackMainWindowClose, prepareUpdateQuit, cancelUpdateQuit } = await import("./app-lifecycle")
    registerAppLifecycle()
    const window = Object.assign(new EventEmitter(), { hide: vi.fn() })
    trackMainWindowClose(window as unknown as BrowserWindow)
    prepareUpdateQuit()
    const closing = { preventDefault: vi.fn() }
    window.emit("close", closing)
    app.emit("window-all-closed")
    expect(closing.preventDefault).not.toHaveBeenCalled()
    expect(mocks.quit).not.toHaveBeenCalled()
    app.emit("before-quit")
    cancelUpdateQuit()
    window.emit("close", closing)
    expect(closing.preventDefault).toHaveBeenCalledOnce()
    expect(window.hide).toHaveBeenCalledOnce()
  })
})
