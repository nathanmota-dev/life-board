import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const native = vi.hoisted(() => ({
  windows: [] as object[],
  compositing: "enabled",
  metrics: [] as { type: string, pid: number }[],
}))
const app = Object.assign(new EventEmitter(), {
  getGPUFeatureStatus: vi.fn(() => ({ gpu_compositing: native.compositing })),
  getAppMetrics: vi.fn(() => native.metrics),
})
vi.mock("electron", () => ({ app, BrowserWindow: { getAllWindows: () => native.windows } }))
// Imported after the mock's variables exist.
const { registerGpuRelease } = await import("./gpu-release")

const DELAY = 10_000
const COOLDOWN = 600_000
const kill = vi.fn((_pid: number, _signal?: string) => true)

function closeAll() { app.emit("window-all-closed") }
function gpuGone(reason: string, type = "GPU") { app.emit("child-process-gone", {}, { type, reason, exitCode: 9 }) }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] })
  native.windows = []
  native.compositing = "enabled"
  native.metrics = [{ type: "Browser", pid: 10 }, { type: "GPU", pid: 42 }]
  kill.mockReset().mockReturnValue(true)
  vi.stubGlobal("process", { ...process, platform: "linux", kill })
  registerGpuRelease({ delayMs: DELAY, cooldownMs: COOLDOWN })
})

afterEach(() => {
  app.removeAllListeners()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("registerGpuRelease", () => {
  it("ends the GPU process once the app has stayed without windows for the delay", () => {
    closeAll()
    vi.advanceTimersByTime(DELAY - 1)
    expect(kill).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(kill).toHaveBeenCalledExactlyOnceWith(42, "SIGKILL")
  })

  it("keeps the GPU process when a window opens before the delay ends", () => {
    closeAll()
    vi.advanceTimersByTime(DELAY / 2)
    app.emit("browser-window-created")
    vi.advanceTimersByTime(DELAY)
    expect(kill).not.toHaveBeenCalled()
  })

  it("does nothing once the app starts quitting", () => {
    closeAll()
    app.emit("will-quit")
    vi.advanceTimersByTime(DELAY)
    expect(kill).not.toHaveBeenCalled()
  })

  it.each([
    ["a window still exists", () => { native.windows = [{}] }],
    ["compositing already runs in software", () => { native.compositing = "disabled_software" }],
    ["there is no GPU process", () => { native.metrics = [{ type: "Browser", pid: 10 }] }],
  ])("leaves the GPU process alone when %s", (_case, arrange) => {
    arrange()
    closeAll()
    vi.advanceTimersByTime(DELAY)
    expect(kill).not.toHaveBeenCalled()
  })

  it.each(["win32", "darwin"])("is not registered on %s", (platform) => {
    app.removeAllListeners()
    vi.stubGlobal("process", { ...process, platform, kill })
    registerGpuRelease({ delayMs: DELAY, cooldownMs: COOLDOWN })
    expect(app.listenerCount("window-all-closed")).toBe(0)
  })

  it("waits for the cooldown after its own exit, then releases again if still without windows", () => {
    closeAll()
    vi.advanceTimersByTime(DELAY)
    gpuGone("killed")
    native.metrics = [{ type: "GPU", pid: 43 }]
    app.emit("browser-window-created")
    vi.advanceTimersByTime(60_000)
    closeAll()
    vi.advanceTimersByTime(DELAY)
    expect(kill).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(COOLDOWN - 60_000 - DELAY - 1)
    expect(kill).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(kill).toHaveBeenLastCalledWith(43, "SIGKILL")
  })

  it("drops a deferred release when a window opens during the cooldown", () => {
    closeAll()
    vi.advanceTimersByTime(DELAY)
    gpuGone("killed")
    app.emit("browser-window-created")
    closeAll()
    vi.advanceTimersByTime(DELAY)
    native.windows = [{}]
    vi.advanceTimersByTime(COOLDOWN)
    expect(kill).toHaveBeenCalledTimes(1)
  })

  it.each(["crashed", "abnormal-exit", "oom"])("stops for the session after an exit it didn't ask for (%s)", (reason) => {
    gpuGone(reason)
    vi.advanceTimersByTime(COOLDOWN)
    closeAll()
    vi.advanceTimersByTime(DELAY)
    expect(kill).not.toHaveBeenCalled()
  })

  it("treats a crash right after its kill request as unexpected", () => {
    closeAll()
    vi.advanceTimersByTime(DELAY)
    gpuGone("crashed")
    vi.advanceTimersByTime(COOLDOWN)
    closeAll()
    vi.advanceTimersByTime(DELAY)
    expect(kill).toHaveBeenCalledTimes(1)
  })

  it("ignores other child processes", () => {
    gpuGone("crashed", "Utility")
    closeAll()
    vi.advanceTimersByTime(DELAY)
    expect(kill).toHaveBeenCalledOnce()
  })

  it("keeps working when the GPU process already exited before the kill", () => {
    kill.mockImplementationOnce(() => { throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" }) })
    closeAll()
    expect(() => vi.advanceTimersByTime(DELAY)).not.toThrow()
    gpuGone("killed")
    vi.advanceTimersByTime(COOLDOWN)
    closeAll()
    vi.advanceTimersByTime(DELAY)
    // The exit wasn't ours, so the session stops releasing.
    expect(kill).toHaveBeenCalledTimes(1)
  })
})
