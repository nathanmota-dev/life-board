import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requestSingleInstanceLock: vi.fn(), whenReady: vi.fn(), quit: vi.fn(),
  handle: vi.fn(), fork: vi.fn(), loadRenderer: vi.fn(), loadSecretKey: vi.fn(),
  isHiddenStartup: vi.fn(), keepInBackground: vi.fn(), isPomodoroActive: vi.fn(),
  registerLocale: vi.fn(), registerNotifications: vi.fn(), registerPomodoro: vi.fn(),
  registerStartupSettings: vi.fn(), registerCaptureShortcut: vi.fn(), unregisterCaptureShortcut: vi.fn(),
  createTray: vi.fn(), showErrorBox: vi.fn(),
}))

class MockWindow extends EventEmitter {
  isDestroyed = vi.fn(() => false)
  isMinimized = vi.fn(() => false)
  restore = vi.fn()
  show = vi.fn()
  hide = vi.fn()
  focus = vi.fn()
  maximize = vi.fn()
  setFullScreen = vi.fn()
  webContents = { send: vi.fn() }
}

const windows: MockWindow[] = []
const createWindow = vi.fn(function () {
  const window = new MockWindow()
  windows.push(window)
  return window
})
const backend = Object.assign(new EventEmitter(), { postMessage: vi.fn(), kill: vi.fn() })
const app = Object.assign(new EventEmitter(), {
  requestSingleInstanceLock: mocks.requestSingleInstanceLock,
  whenReady: mocks.whenReady, quit: mocks.quit,
  getPath: vi.fn(() => "/tmp/life-board-test"), getAppPath: vi.fn(() => "/app"),
  getVersion: vi.fn(() => "1.0.0"), isPackaged: false,
  dock: { setIcon: vi.fn() }, setAppUserModelId: vi.fn(),
})

vi.mock("electron", () => ({
  app, BrowserWindow: createWindow, utilityProcess: { fork: mocks.fork },
  ipcMain: { handle: mocks.handle }, dialog: { showErrorBox: mocks.showErrorBox },
  shell: { openExternal: vi.fn() },
}))
vi.mock("./backend-process?modulePath", () => ({ default: "/backend.js" }))
vi.mock("../resources/icon.png?asset", () => ({ default: "/icon.png" }))
vi.mock("./capture-window", () => ({
  registerCaptureShortcut: mocks.registerCaptureShortcut,
  unregisterCaptureShortcut: mocks.unregisterCaptureShortcut,
}))
vi.mock("./locale", () => ({ registerLocale: mocks.registerLocale }))
vi.mock("./login-item", () => ({ isHiddenStartup: mocks.isHiddenStartup }))
vi.mock("./notifications", () => ({ registerNotifications: mocks.registerNotifications }))
vi.mock("./pomodoro", () => ({ registerPomodoro: mocks.registerPomodoro, isPomodoroActive: mocks.isPomodoroActive }))
vi.mock("./renderer", () => ({ loadRenderer: mocks.loadRenderer, secureWebPreferences: {} }))
vi.mock("./secret-key", () => ({ loadSecretKey: mocks.loadSecretKey }))
vi.mock("./startup-settings", () => ({
  registerStartupSettings: mocks.registerStartupSettings, keepInBackground: mocks.keepInBackground,
}))
vi.mock("./tray", () => ({ createTray: mocks.createTray }))
vi.mock("./window-state", () => ({
  loadWindowState: () => ({ maximized: false, fullScreen: false }),
  defaultBounds: () => ({ x: 0, y: 0, width: 1200, height: 800 }), trackWindowState: vi.fn(),
}))

let finishReady: () => void
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  windows.length = 0
  const ready = new Promise<void>((resolve) => { finishReady = resolve })
  mocks.whenReady.mockReturnValue(ready)
  mocks.requestSingleInstanceLock.mockReturnValue(true)
  mocks.isHiddenStartup.mockReturnValue(false)
  mocks.keepInBackground.mockReturnValue(true)
  mocks.isPomodoroActive.mockReturnValue(false)
  mocks.fork.mockReturnValue(backend)
  mocks.loadRenderer.mockResolvedValue(undefined)
  mocks.loadSecretKey.mockImplementation(() => Buffer.alloc(32))
})
afterEach(() => {
  app.removeAllListeners()
  backend.removeAllListeners()
})

function launchAgain(args: string[] = []) {
  app.emit("second-instance", {}, ["/app/life-board", ...args], "/app")
}

async function ready() {
  finishReady()
  await Promise.resolve()
}

describe("single-instance startup", () => {
  it("exits a secondary process before initializing any application resources", async () => {
    mocks.requestSingleInstanceLock.mockReturnValue(false)
    await import("./main")
    await ready()
    expect(mocks.quit).toHaveBeenCalledOnce()
    expect(mocks.whenReady).not.toHaveBeenCalled()
    for (const initialize of [
      mocks.handle, mocks.loadSecretKey, mocks.fork, createWindow, mocks.createTray,
      mocks.registerLocale, mocks.registerNotifications, mocks.registerPomodoro,
      mocks.registerStartupSettings, mocks.registerCaptureShortcut,
    ]) expect(initialize).not.toHaveBeenCalled()
    expect(app.listenerCount("second-instance")).toBe(0)
    expect(app.listenerCount("will-quit")).toBe(0)
  })

  it("reopens the same hidden window without reloading or navigating", async () => {
    await import("./main")
    await ready()
    const window = windows[0]
    window.emit("ready-to-show")
    const close = { preventDefault: vi.fn() }
    window.emit("close", close)
    expect(close.preventDefault).toHaveBeenCalledOnce()
    expect(window.hide).toHaveBeenCalledOnce()
    window.show.mockClear()

    launchAgain()

    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
    expect(window.webContents.send).not.toHaveBeenCalled()
    expect(mocks.loadRenderer).toHaveBeenCalledOnce()
    expect(createWindow).toHaveBeenCalledOnce()
    expect(mocks.fork).toHaveBeenCalledOnce()
    expect(mocks.createTray).toHaveBeenCalledOnce()
  })

  it.each([false, true])("focuses the existing visible window (minimized=%s)", async (minimized) => {
    await import("./main")
    await ready()
    const window = windows[0]
    window.isMinimized.mockReturnValue(minimized)
    launchAgain()
    expect(window.restore).toHaveBeenCalledTimes(minimized ? 1 : 0)
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
    expect(createWindow).toHaveBeenCalledOnce()
    expect(mocks.loadRenderer).toHaveBeenCalledOnce()
    expect(window.webContents.send).not.toHaveBeenCalled()
  })

  it.each([false, true])("coalesces launches during startup (hidden=%s)", async (hidden) => {
    mocks.isHiddenStartup.mockReturnValue(hidden)
    await import("./main")
    launchAgain()
    launchAgain()
    expect(createWindow).not.toHaveBeenCalled()
    expect(mocks.fork).not.toHaveBeenCalled()
    await ready()
    launchAgain()
    launchAgain()
    expect(createWindow).toHaveBeenCalledOnce()
    expect(mocks.loadRenderer).toHaveBeenCalledOnce()
    expect(mocks.fork).toHaveBeenCalledOnce()
    expect(mocks.createTray).toHaveBeenCalledOnce()
    expect(windows[0].webContents.send).not.toHaveBeenCalled()
  })

  it("creates a main window on demand after a hidden startup", async () => {
    mocks.isHiddenStartup.mockReturnValue(true)
    await import("./main")
    await ready()
    expect(createWindow).not.toHaveBeenCalled()
    launchAgain()
    launchAgain()
    expect(createWindow).toHaveBeenCalledOnce()
    expect(mocks.fork).toHaveBeenCalledOnce()
    expect(mocks.createTray).toHaveBeenCalledOnce()
  })

  it.each([false, true])("ignores hidden secondary launches before and after startup (hidden=%s)", async (hidden) => {
    mocks.isHiddenStartup.mockReturnValue(hidden)
    await import("./main")
    launchAgain(["--hidden", "--no-sandbox"])
    await ready()
    launchAgain(["--hidden"])
    expect(createWindow).toHaveBeenCalledTimes(hidden ? 0 : 1)
    if (!hidden) {
      expect(windows[0].show).not.toHaveBeenCalled()
      expect(windows[0].focus).not.toHaveBeenCalled()
    }
  })

  it("recreates a destroyed main window without restarting background resources", async () => {
    await import("./main")
    await ready()
    windows[0].isDestroyed.mockReturnValue(true)
    launchAgain()
    launchAgain()
    expect(createWindow).toHaveBeenCalledTimes(2)
    expect(mocks.fork).toHaveBeenCalledOnce()
    expect(mocks.createTray).toHaveBeenCalledOnce()
  })

  it("keeps tray navigation, activation and Quit working after reopening", async () => {
    await import("./main")
    await ready()
    launchAgain()
    const openRoute = mocks.createTray.mock.calls[0][1] as (route?: string) => void
    openRoute("/pomodoro")
    expect(windows[0].webContents.send).toHaveBeenCalledExactlyOnceWith("app:navigate", "/pomodoro")
    app.emit("activate")
    expect(createWindow).toHaveBeenCalledOnce()
    app.emit("before-quit")
    const close = { preventDefault: vi.fn() }
    windows[0].emit("close", close)
    expect(close.preventDefault).not.toHaveBeenCalled()
    expect(backend.kill).toHaveBeenCalledOnce()
    app.emit("will-quit")
    expect(mocks.unregisterCaptureShortcut).toHaveBeenCalledOnce()
  })

  it("does not open a pending window if initialization fails", async () => {
    mocks.loadSecretKey.mockImplementation(() => { throw new Error("Keychain unavailable") })
    await import("./main")
    launchAgain()
    await ready()
    launchAgain()
    expect(mocks.showErrorBox).toHaveBeenCalledWith("Life Board", "Keychain unavailable")
    expect(mocks.quit).toHaveBeenCalledOnce()
    expect(createWindow).not.toHaveBeenCalled()
    expect(mocks.fork).not.toHaveBeenCalled()
  })
})
