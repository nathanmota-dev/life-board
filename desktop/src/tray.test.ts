import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PomodoroState } from "./pomodoro-timer"

const mocks = vi.hoisted(() => ({
  state: null as unknown as PomodoroState,
  listeners: [] as ((state: PomodoroState) => void)[],
  setToolTip: vi.fn(),
  setContextMenu: vi.fn(),
  setImage: vi.fn(),
}))
vi.mock("electron", () => ({
  app: { quit: vi.fn() },
  Menu: { buildFromTemplate: (template: unknown) => template },
  Tray: class {
    setToolTip = mocks.setToolTip
    setContextMenu = mocks.setContextMenu
    setImage = mocks.setImage
    on() {}
  },
}))
vi.mock("./locale", () => ({
  t: (key: string, values?: Record<string, unknown>) => `${key}${values ? JSON.stringify(values) : ""}`,
  onLanguageChange: () => {},
}))
vi.mock("./pomodoro", () => ({
  getPomodoroState: () => mocks.state,
  onPomodoroChange: (listener: (state: PomodoroState) => void) => mocks.listeners.push(listener),
  dispatchPomodoro: vi.fn(),
}))
vi.mock("./tray-icon", () => ({ appTrayIcon: () => "app-icon", ringIcon: () => "ring-icon" }))

const now = Date.UTC(2026, 10, 21, 12)
const running = (): PomodoroState => ({
  phase: "focus", status: "running", durationMs: 25 * 60_000, remainingMs: 25 * 60_000, endsAt: now + 15 * 60_000, cycle: 0,
  settings: {} as PomodoroState["settings"], today: { day: "2026-11-21", sessions: 0, focusMinutes: 0 },
})

async function start(platform: NodeJS.Platform) {
  vi.stubGlobal("process", { ...process, platform })
  const { createTray } = await import("./tray")
  mocks.state = running()
  createTray("/icon.png", vi.fn())
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.useFakeTimers({ now })
  mocks.listeners.length = 0
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("tray during a running pomodoro", () => {
  it("on Linux, changes the tooltip and menu only once a minute so an open menu doesn't flash", async () => {
    await start("linux")
    expect(mocks.setToolTip).toHaveBeenCalledOnce()
    expect(mocks.setContextMenu).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(59_000)
    expect(mocks.setToolTip).toHaveBeenCalledOnce()
    expect(mocks.setContextMenu).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(1_000)
    expect(mocks.setToolTip).toHaveBeenCalledTimes(2)
    expect(mocks.setToolTip).toHaveBeenLastCalledWith(expect.stringContaining('"minutes":14'))
    expect(mocks.setContextMenu).toHaveBeenCalledTimes(2)
  })

  it("keeps the per-second countdown in the tooltip on Windows", async () => {
    await start("win32")
    vi.advanceTimersByTime(3_000)
    expect(mocks.setToolTip).toHaveBeenCalledTimes(4)
    expect(mocks.setToolTip).toHaveBeenLastCalledWith(expect.stringContaining('"time":"14:57"'))
    expect(mocks.setContextMenu).toHaveBeenCalledOnce()
  })
})
