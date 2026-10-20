import type { UpdateRelease, UpdateState } from "../../web/src/types/updates"
import { DAY, RETRIES, isNewStable, updateError, UpdateFailure } from "./update-state"
import type { UpdateStore } from "./update-state"

export type UpdateDriver = {
  check: () => Promise<UpdateRelease | null>
  download: (version: string, progress: (percent: number) => void) => Promise<void>
  install: () => Promise<void>
  dispose: () => void
}
export type UpdateOptions = {
  installedVersion: string
  format: UpdateState["format"]
  driver: UpdateDriver | null
  store: UpdateStore
  broadcast: (state: UpdateState) => void
  notify: (version: string) => void
}

/** One instance owned by main, independent of windows and React subscriptions. */
export class AppUpdates {
  private history
  private state: UpdateState
  private timer?: NodeJS.Timeout
  private pending: Promise<UpdateState> | null = null
  private disposed = false

  constructor(private options: UpdateOptions) {
    this.history = options.store.load()
    const release = this.history.release && isNewStable(this.history.release.version, options.installedVersion) ? this.history.release : null
    this.state = {
      status: options.driver ? (release ? "available" : "idle") : "unavailable",
      installedVersion: options.installedVersion, format: options.format,
      lastAttempt: this.history.lastAttempt, lastSuccess: this.history.lastSuccess,
      release, progress: null, error: null, retryAction: "check",
    }
    this.schedule()
  }

  getState = () => this.state

  private publish(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch }
    if (!this.disposed) this.options.broadcast(this.state)
  }

  private save() {
    try { this.options.store.save(this.history) } catch { throw new UpdateFailure("storage") }
  }

  private schedule() {
    clearTimeout(this.timer)
    if (this.disposed || !this.options.driver) return
    this.timer = setTimeout(() => {
      if (this.pending || ["ready", "installing", "downloading"].includes(this.state.status)) {
        this.timer = setTimeout(() => this.schedule(), 60_000)
      } else void this.check()
    }, Math.max(0, this.history.nextCheck - Date.now()))
  }

  /** Manual and scheduled checks share the same request; a failed check is never 'up to date'. */
  check = (): Promise<UpdateState> => {
    if (this.pending) return this.pending
    if (!this.options.driver || this.disposed || ["ready", "installing"].includes(this.state.status)) return Promise.resolve(this.state)
    this.pending = this.performCheck().finally(() => { this.pending = null; this.schedule() })
    return this.pending
  }

  private async performCheck() {
    this.history.lastAttempt = Date.now()
    this.history.nextCheck = Date.now() + DAY
    this.publish({ status: "checking", lastAttempt: this.history.lastAttempt, error: null, retryAction: "check" })
    try {
      // Persist before accessing the network so relaunch cannot reset the attempt schedule.
      this.save()
      const release = await this.options.driver!.check()
      if (this.disposed) return this.state
      this.history.lastSuccess = Date.now()
      this.history.failures = 0
      this.history.nextCheck = Date.now() + DAY
      this.history.release = release
      this.save()
      this.publish({ status: release ? "available" : "up-to-date", lastSuccess: this.history.lastSuccess, release, progress: null })
      if (release && (!this.history.lastNotified || isNewStable(release.version, this.history.lastNotified))) {
        this.history.lastNotified = release.version
        this.save()
        this.options.notify(release.version)
      }
    } catch (error) {
      if (this.disposed) return this.state
      const delay = RETRIES[this.history.failures] ?? DAY
      this.history.failures = Math.min(this.history.failures + 1, RETRIES.length + 1)
      this.history.nextCheck = Date.now() + delay
      try { this.save() } catch { /* Surface persistence errors through the original failure. */ }
      this.publish({ status: "error", error: updateError(error) })
    }
    return this.state
  }

  download = (): Promise<UpdateState> => this.action("download")
  install = (): Promise<UpdateState> => this.action("install")

  private action(action: "download" | "install"): Promise<UpdateState> {
    if (this.pending) return this.pending
    const retry = this.state.status === "error" && this.state.retryAction === action
    const allowed = action === "download" ? this.state.status === "available" : this.state.status === "ready"
    if (!this.options.driver || this.disposed || !this.state.release || !(allowed || retry)) return Promise.resolve(this.state)
    this.pending = this.performAction(action).finally(() => { this.pending = null; this.schedule() })
    return this.pending
  }

  private async performAction(action: "download" | "install") {
    this.publish({ status: action === "download" ? "downloading" : "installing", error: null, retryAction: action, progress: action === "download" ? 0 : this.state.progress })
    try {
      if (action === "download") {
        await this.options.driver!.download(this.state.release!.version, (progress) => {
          if (!this.disposed) this.publish({ progress: Math.max(0, Math.min(100, progress)) })
        })
        if (!this.disposed) this.publish({ status: "ready", progress: 100 })
      } else await this.options.driver!.install()
    } catch (error) {
      if (!this.disposed) this.publish({ status: "error", error: updateError(error), retryAction: updateError(error) === "integrity" ? "download" : action })
    }
    return this.state
  }

  dispose = () => {
    this.disposed = true
    clearTimeout(this.timer)
    this.options.driver?.dispose()
  }
}
