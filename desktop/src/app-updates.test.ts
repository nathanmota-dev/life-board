import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AppUpdates } from "./app-updates"
import type { UpdateDriver } from "./app-updates"
import { DAY, RETRIES, emptyHistory, UpdateFailure } from "./update-state"
import type { UpdateHistory } from "./update-state"

const release = { version: "1.10.0", releaseDate: "2026-10-20", notes: "Changes", url: "https://github.com/nathanmota-dev/life-board/releases/tag/v1.10.0" }
let history: UpdateHistory
let driver: UpdateDriver
let notify: ReturnType<typeof vi.fn<(version: string) => void>>
const instances: AppUpdates[] = []
function create(available = true) {
  const updates = new AppUpdates({
    installedVersion: "1.9.0", format: available ? "deb" : null, driver: available ? driver : null,
    store: { load: () => structuredClone(history), save: (next) => { history = structuredClone(next) } },
    broadcast: vi.fn(), notify,
  })
  instances.push(updates)
  return updates
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"))
  history = emptyHistory()
  driver = { check: vi.fn().mockResolvedValue(null), download: vi.fn().mockResolvedValue(undefined), install: vi.fn().mockResolvedValue(undefined), dispose: vi.fn() }
  notify = vi.fn()
})
afterEach(() => { for (const updates of instances.splice(0)) updates.dispose(); vi.useRealTimers() })

describe("main-process updates", () => {
  it("checks asynchronously on first launch and every day with no window", async () => {
    const updates = create()
    expect(driver.check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(0)
    expect(driver.check).toHaveBeenCalledOnce()
    expect(updates.getState().status).toBe("up-to-date")
    expect(history.lastAttempt).toBe(Date.now())
    expect(history.lastSuccess).toBe(Date.now())
    await vi.advanceTimersByTimeAsync(DAY - 1)
    expect(driver.check).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(driver.check).toHaveBeenCalledTimes(2)
  })

  it("preserves the due time across relaunch and immediately checks overdue attempts", async () => {
    const first = create()
    await vi.advanceTimersByTimeAsync(0)
    first.dispose()
    await vi.advanceTimersByTimeAsync(DAY / 2)
    const second = create()
    await vi.advanceTimersByTimeAsync(DAY / 2 - 1)
    expect(driver.check).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(driver.check).toHaveBeenCalledTimes(2)
    second.dispose()
    vi.setSystemTime(Date.now() + DAY + 1)
    create()
    await vi.advanceTimersByTimeAsync(0)
    expect(driver.check).toHaveBeenCalledTimes(3)
  })

  it("records attempts separately, retries with bounded persisted backoff, and keeps manual checks available", async () => {
    vi.mocked(driver.check).mockRejectedValue(new Error("offline"))
    let updates = create()
    await vi.advanceTimersByTimeAsync(0)
    expect(updates.getState()).toMatchObject({ status: "error", error: "network", lastSuccess: null })
    expect(history.lastAttempt).toBe(Date.now())
    updates.dispose()
    updates = create()
    for (const delay of [...RETRIES, DAY]) {
      await vi.advanceTimersByTimeAsync(delay)
      expect(updates.getState().lastSuccess).toBeNull()
    }
    expect(driver.check).toHaveBeenCalledTimes(5)
    vi.mocked(driver.check).mockResolvedValue(null)
    await updates.check()
    expect(updates.getState().status).toBe("up-to-date")
    expect(history.failures).toBe(0)
    expect(history.nextCheck).toBe(Date.now() + DAY)
  })

  it("coalesces checks and actions and never implicitly downloads or installs", async () => {
    let resolve!: (value: typeof release) => void
    vi.mocked(driver.check).mockReturnValue(new Promise((done) => { resolve = done }))
    const updates = create()
    const first = updates.check()
    expect(updates.check()).toBe(first)
    expect(updates.download()).toBe(first)
    expect(updates.install()).toBe(first)
    expect(updates.getState().status).toBe("checking")
    resolve(release)
    await first
    expect(driver.check).toHaveBeenCalledOnce()
    expect(driver.download).not.toHaveBeenCalled()
    expect(driver.install).not.toHaveBeenCalled()
    updates.dispose()
    expect(driver.install).not.toHaveBeenCalled()
  })

  it("persists availability and only notifies once per newer version across restarts", async () => {
    vi.mocked(driver.check).mockResolvedValue(release)
    const first = create()
    await first.check()
    first.dispose()
    const second = create()
    expect(second.getState()).toMatchObject({ status: "available", release })
    await second.check()
    await vi.advanceTimersByTimeAsync(DAY)
    expect(notify).toHaveBeenCalledExactlyOnceWith("1.10.0")
    vi.mocked(driver.check).mockResolvedValue({ ...release, version: "1.11.0" })
    await second.check()
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it("streams progress, requires explicit install, and recovers from cancelled authorization", async () => {
    vi.mocked(driver.check).mockResolvedValue(release)
    const updates = create()
    await updates.check()
    let finish!: () => void
    vi.mocked(driver.download).mockImplementation((_version, progress) => {
      progress(42)
      return new Promise((resolve) => { finish = resolve })
    })
    const downloading = updates.download()
    expect(updates.getState()).toMatchObject({ status: "downloading", progress: 42 })
    expect(updates.download()).toBe(downloading)
    expect(updates.install()).toBe(downloading)
    finish()
    await downloading
    expect(updates.getState().status).toBe("ready")
    await vi.advanceTimersByTimeAsync(DAY)
    expect(driver.install).not.toHaveBeenCalled()
    vi.mocked(driver.install).mockRejectedValueOnce(new UpdateFailure("permission"))
    await updates.install()
    expect(updates.getState()).toMatchObject({ status: "error", error: "permission", retryAction: "install" })
    await updates.install()
    expect(driver.install).toHaveBeenCalledTimes(2)
  })

  it("allows a fresh download after an installation checksum failure", async () => {
    vi.mocked(driver.check).mockResolvedValue(release)
    const updates = create()
    await updates.check()
    await updates.download()
    vi.mocked(driver.install).mockRejectedValue(new UpdateFailure("integrity"))
    await updates.install()
    expect(updates.getState()).toMatchObject({ status: "error", error: "integrity", retryAction: "download" })
    await updates.download()
    expect(updates.getState().status).toBe("ready")
  })

  it("cleans up timers and ignores a request completing after quit", async () => {
    let finish!: (value: typeof release) => void
    vi.mocked(driver.check).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const updates = create()
    const pending = updates.check()
    updates.dispose()
    finish(release)
    await pending
    await vi.advanceTimersByTimeAsync(DAY * 5)
    expect(driver.check).toHaveBeenCalledOnce()
    expect(notify).not.toHaveBeenCalled()
    expect(driver.dispose).toHaveBeenCalledOnce()
  })

  it("truthfully disables updates in development and unsupported distributions", async () => {
    const updates = create(false)
    await updates.check()
    await updates.download()
    await updates.install()
    await vi.advanceTimersByTimeAsync(DAY * 2)
    expect(updates.getState().status).toBe("unavailable")
    expect(driver.check).not.toHaveBeenCalled()
  })
})
