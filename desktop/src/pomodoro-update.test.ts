import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] }, ipcMain: { handle: vi.fn() }, powerMonitor: { on: vi.fn() },
}))
vi.mock("./locale", () => ({ t: vi.fn() }))
vi.mock("./notifications", () => ({ showNotification: vi.fn() }))
let directory: string
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); directory = mkdtempSync(join(tmpdir(), "life-board-pomodoro-")) })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); rmSync(directory, { recursive: true, force: true }) })

describe("pomodoro update restart", () => {
  it.each(["running", "paused"] as const)("restores a %s session once after an explicit update", async (status) => {
    let pomodoro = await import("./pomodoro")
    pomodoro.registerPomodoro(directory)
    pomodoro.dispatchPomodoro({ type: "start" })
    await vi.advanceTimersByTimeAsync(60_000)
    if (status === "paused") pomodoro.dispatchPomodoro({ type: "pause" })
    pomodoro.preservePomodoroForUpdate()
    vi.clearAllTimers()
    vi.resetModules()
    pomodoro = await import("./pomodoro")
    pomodoro.registerPomodoro(directory)
    expect(pomodoro.getPomodoroState()).toMatchObject({ status, remainingMs: 24 * 60_000, phase: "focus" })
    vi.clearAllTimers()
    vi.resetModules()
    pomodoro = await import("./pomodoro")
    pomodoro.registerPomodoro(directory)
    expect(pomodoro.getPomodoroState().status).toBe("idle")
  })

  it("discards a failed installation snapshot before an ordinary launch", async () => {
    let pomodoro = await import("./pomodoro")
    pomodoro.registerPomodoro(directory)
    pomodoro.dispatchPomodoro({ type: "start" })
    pomodoro.preservePomodoroForUpdate()
    pomodoro.cancelPomodoroUpdate()
    vi.clearAllTimers()
    vi.resetModules()
    pomodoro = await import("./pomodoro")
    pomodoro.registerPomodoro(directory)
    expect(pomodoro.getPomodoroState().status).toBe("idle")
  })
})
