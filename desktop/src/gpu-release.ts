import { app, BrowserWindow } from "electron"

export type GpuReleaseOptions = {
  /** How long the app must stay without windows before the GPU process is ended. */
  delayMs?: number
  /** Minimum time since the GPU process last exited before ending it again. */
  cooldownMs?: number
}

/**
 * Ends the GPU process once every window is closed, so the memory it built up while the
 * window was open is returned; Chromium starts a fresh one right away. Chromium counts each
 * exit as a crash and turns acceleration off at 3, forgiving one every 5 minutes, so exits are
 * spaced by `cooldownMs` and any exit we didn't ask for stops this for the session.
 */
export function registerGpuRelease({ delayMs = 10_000, cooldownMs = 10 * 60_000 }: GpuReleaseOptions = {}) {
  if (process.platform !== "linux") return
  let timer: NodeJS.Timeout | undefined
  let lastExit = -Infinity
  let expectingExit = false
  let suspended = false

  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const schedule = (ms: number) => {
    cancel()
    timer = setTimeout(release, ms)
  }

  function release() {
    timer = undefined
    if (suspended || BrowserWindow.getAllWindows().length > 0) return
    // Software compositing has no GPU memory to give back.
    if (!app.getGPUFeatureStatus().gpu_compositing.startsWith("enabled")) return
    // Monotonic clock: tests shift Date, and the system clock can jump.
    const wait = lastExit + cooldownMs - performance.now()
    if (wait > 0) return schedule(wait)
    const gpu = app.getAppMetrics().find((metric) => metric.type === "GPU")
    if (!gpu) return
    expectingExit = true
    try {
      process.kill(gpu.pid, "SIGKILL")
    } catch {
      expectingExit = false // It already exited; its own `child-process-gone` handles it.
    }
  }

  app.on("window-all-closed", () => schedule(delayMs))
  app.on("browser-window-created", cancel)
  app.on("will-quit", cancel)
  app.on("child-process-gone", (_event, details) => {
    if (details.type !== "GPU") return
    lastExit = performance.now()
    const requested = expectingExit && details.reason === "killed"
    expectingExit = false
    if (!requested) suspended = true
  })
}
